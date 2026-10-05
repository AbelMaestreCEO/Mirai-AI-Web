/* ============================================
   MIRAI AI - Mirror: subida y empaquetado de fotos y vídeos

   ============================================ */
import { requireAuth } from '../lib/auth';
import { jsonResponse } from '../lib/http';
import {
  ZIP_FLAG_DATA_DESCRIPTOR,
  buildCentralHeader,
  buildDataDescriptor,
  buildEndOfCentralDirectory,
  buildLocalHeader,
  crc32,
  crc32Update,
} from '../lib/zip-stream';

const MIRROR_CONFIG = {
  // El tope por sesion ya no limita la descarga: el empaquetado va por lotes
  // (ver mirrorPlanSession), asi que solo esta aqui como red de seguridad.
  MAX_FILES: 5000,
  MAX_FILE_SIZE: 15 * 1024 * 1024,        // imagenes
  MAX_VIDEO_SIZE: 25 * 1024 * 1024,       // videos
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic'],
  ALLOWED_VIDEO_TYPES: ['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/x-matroska'],
  // Cada lote se arma entero en memoria: el isolate tiene 128 MB, asi que se
  // corta por bytes y no por numero de archivos. 200 fotos de 500 KB caben;
  // 200 de 5 MB no. El tope de archivos evita ademas pasarse de subrequests.
  // El tope real es la MITAD del isolate, no el isolate entero: los ArrayBuffer
  // bajados de R2 siguen vivos mientras `new Blob(parts)` copia todo el ZIP, asi
  // que un lote de N MB ocupa 2N MB en el pico. Con 60 MB ese pico rozaba los
  // 128 MB y el worker moria a mitad de peticion: el navegador se quedaba
  // esperando un ZIP que no llegaba nunca.
  BATCH_MAX_BYTES: 30 * 1024 * 1024,
  BATCH_MAX_FILES: 200,
  // El ZIP unico se transmite en streaming, asi que el tamanio total da igual:
  // lo que topa es el numero de objetos, porque cada GET a R2 gasta un
  // subrequest y el Worker tiene 1000 por invocacion. Se deja margen para las
  // consultas a D1 y el resto de la peticion.
  SINGLE_ZIP_MAX_FILES: 900,
  // Las filas escritas antes de existir size_bytes valen 0. Si se contaran como
  // 0 bytes, un lote se llevaria 200 archivos de tamanio real desconocido y
  // reventaria el isolate. Se les asume un peso conservador.
  LEGACY_SIZE_ESTIMATE: 8 * 1024 * 1024,
  CLEANUP_DAYS: 7
};

// ============================================
// MIRROR — Subida individual + empaquetado
// ============================================

// El sessionId viaja en el cuerpo de las peticiones, así que por sí solo no
// prueba nada: la sesión se ata al DNI que la creó y todas las rutas del módulo
// comprueban esa propiedad. Antes bastaba conocer (o adivinar) un sessionId
// ajeno para descargarse el ZIP de fotos de otro o borrárselo.
// Estas migraciones corren en caliente en cada request. Sin memo, subir 2000
// archivos lanzaba 2000 ALTER TABLE inutiles contra D1.
let _mirrorOwnerColumnReady = false;

let _mirrorSizeColumnReady  = false;

async function ensureMirrorSessionOwnerColumn(env: Env) {
  if (_mirrorOwnerColumnReady) return;
  try {
    await env.MIRAI_AI_DB.prepare(
      `ALTER TABLE photo_sessions ADD COLUMN user_dni TEXT`
    ).run();
  } catch (_) { /* la columna ya existe */ }
  _mirrorOwnerColumnReady = true;
}

/**
 * El empaquetado por lotes necesita saber cuanto pesa cada archivo SIN bajarlo
 * de R2; sin esta columna habria que hacer un GET por objeto solo para medir.
 */
async function ensureMirrorPhotoSizeColumn(env: Env) {
  if (_mirrorSizeColumnReady) return;
  try {
    await env.MIRAI_AI_DB.prepare(
      `ALTER TABLE photos ADD COLUMN size_bytes INTEGER DEFAULT 0`
    ).run();
  } catch (_) { /* la columna ya existe */ }
  _mirrorSizeColumnReady = true;
}

/** Clasifica el MIME en 'image' | 'video' | null segun lo permitido. */
function mirrorMediaKind(mime: string) {
  const t = (mime || '').toLowerCase();
  if (MIRROR_CONFIG.ALLOWED_TYPES.includes(t)) return 'image';
  if (MIRROR_CONFIG.ALLOWED_VIDEO_TYPES.includes(t)) return 'video';
  return null;
}

/**
 * Reparte las filas en lotes cortando por bytes acumulados.
 * Un archivo que por si solo supere el tope se lleva su propio lote: mas vale
 * un ZIP con un unico video de 25 MB que un lote que revienta el isolate.
 * El orden es el mismo que usa el empaquetado, para que offset/limit sean
 * estables entre llamadas.
 */
function buildMirrorBatches(rows: any[]) {
  const batches: any[] = [];
  let current: any = null;

  rows.forEach((row, i) => {
    const size = Number(row.size_bytes) || 0;
    const wouldExceedBytes = current && current.bytes + size > MIRROR_CONFIG.BATCH_MAX_BYTES;
    const wouldExceedCount = current && current.count >= MIRROR_CONFIG.BATCH_MAX_FILES;

    if (!current || wouldExceedBytes || wouldExceedCount) {
      current = { index: batches.length, offset: i, count: 0, bytes: 0 };
      batches.push(current);
    }
    current.count++;
    current.bytes += size;
  });

  return batches;
}

/** Devuelve la sesión de fotos si pertenece al usuario; si no, null. */
async function getOwnedMirrorSession(sessionId: string, userDni: string, env: Env) {
  await ensureMirrorSessionOwnerColumn(env);
  const row = await env.MIRAI_AI_DB.prepare(
    'SELECT session_id, user_dni FROM photo_sessions WHERE session_id = ?'
  ).bind(sessionId).first<any>();
  if (!row) return null;
  return (row.user_dni || '').toUpperCase() === userDni.toUpperCase() ? row : null;
}

export async function mirrorCreateSession(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ success: false, error: 'No autorizado' }, 401, corsHeaders);

  // crypto.randomUUID en vez de Math.random: un identificador de sesión
  // predecible no protege nada.
  const sessionId = `mirai_${crypto.randomUUID()}`;
  if (env.MIRAI_AI_DB) {
    try {
      await ensureMirrorSessionOwnerColumn(env);
      await env.MIRAI_AI_DB.prepare(
        `INSERT INTO photo_sessions (session_id, image_count, created_at, user_dni) VALUES (?, 0, ?, ?)`
      ).bind(sessionId, new Date().toISOString(), userDni.toUpperCase()).run();
    } catch (e) {
      console.error('D1 session insert error:', e.message);
      return jsonResponse({ success: false, error: 'No se pudo crear la sesión' }, 500, corsHeaders);
    }
  }
  return jsonResponse({ success: true, sessionId }, 200, corsHeaders);
}

export async function mirrorUploadImage(request: Request, env: Env, corsHeaders: Record<string, string>) {
  if (!env.MIRAI_AI_DB || !env.MIRAI_PHOTOS) {
    return jsonResponse({ success: false, error: 'Server configuration error' }, 500, corsHeaders);
  }

  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ success: false, error: 'No autorizado' }, 401, corsHeaders);

  let formData;
  try { formData = await request.formData(); } catch (e) {
    return jsonResponse({ success: false, error: 'Invalid form data' }, 400, corsHeaders);
  }

  const file = formData.get('image') as File | null;
  const sessionId = formData.get('sessionId') as string | null;
  const lastModified = Number(formData.get('lastModified') || 0);

  if (!file || !sessionId) {
    return jsonResponse({ success: false, error: 'Missing image or sessionId' }, 400, corsHeaders);
  }

  const session = await getOwnedMirrorSession(sessionId, userDni, env);
  if (!session) {
    return jsonResponse({ success: false, error: 'Sesión no encontrada' }, 404, corsHeaders);
  }

  // MIRROR_CONFIG.ALLOWED_TYPES / MAX_FILES estaban declarados pero nunca se
  // aplicaban: la subida era anónima, ilimitada y sin límite de tamaño.
  const kind = mirrorMediaKind(file.type);
  if (!kind) {
    return jsonResponse({ success: false, error: 'Formato no admitido' }, 400, corsHeaders);
  }

  const sizeLimit = kind === 'video' ? MIRROR_CONFIG.MAX_VIDEO_SIZE : MIRROR_CONFIG.MAX_FILE_SIZE;
  if (file.size > sizeLimit) {
    const mb = Math.round(sizeLimit / (1024 * 1024));
    return jsonResponse(
      { success: false, error: `${kind === 'video' ? 'El vídeo' : 'La imagen'} excede el límite de ${mb} MB` },
      400, corsHeaders
    );
  }

  const countRow = await env.MIRAI_AI_DB.prepare(
    'SELECT COUNT(*) AS c FROM photos WHERE session_id = ?'
  ).bind(sessionId).first<any>();
  if ((countRow?.c || 0) >= MIRROR_CONFIG.MAX_FILES) {
    return jsonResponse(
      { success: false, error: `Máximo ${MIRROR_CONFIG.MAX_FILES} imágenes por sesión` },
      400, corsHeaders
    );
  }

  let dateStr = kind === 'video'
    ? await extractVideoDate(file)
    : await extractEXIFDate(file);
  if (!dateStr) dateStr = extractDateFromFilename(file.name);
  if (!dateStr && lastModified) dateStr = new Date(lastModified).toISOString().split('T')[0];
  if (!dateStr) dateStr = new Date().toISOString().split('T')[0];

  const [year, month, day] = dateStr.split('-');
  const folderName = `${day}-${month}-${year}`;

  // Antes se hacia `await file.arrayBuffer()`: con un video de 25 MB eso es una
  // copia integra en el isolate. R2 acepta el Blob tal cual y ya conoce su
  // tamanio, asi que se le pasa directo.
  const fileId = crypto.randomUUID();
  // El nombre original del fichero va a la clave de R2: sin sanear, un nombre
  // con "/" o ".." reorganiza claves ajenas dentro del bucket.
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^\w\-. ]/g, '_').slice(0, 80) || 'imagen';
  const r2Key = `${sessionId}/${folderName}/${baseName}_${fileId}.${ext}`;

  await env.MIRAI_PHOTOS.put(r2Key, file, {
    customMetadata: { sessionId, originalName: file.name, folder: folderName, dateStr, kind },
    httpMetadata: { contentType: file.type || 'application/octet-stream' }
  });

  try {
    await ensureMirrorPhotoSizeColumn(env);
    await env.MIRAI_AI_DB.prepare(
      `INSERT INTO photos (session_id, r2_key, date_str, original_name, size_bytes) VALUES (?, ?, ?, ?, ?)`
    ).bind(sessionId, r2Key, dateStr, file.name, file.size).run();
    await env.MIRAI_AI_DB.prepare(
      `UPDATE photo_sessions SET image_count = image_count + 1 WHERE session_id = ?`
    ).bind(sessionId).run();
  } catch (e) {
    console.warn('D1 insert error:', e.message);
  }

  return jsonResponse({ success: true, fileId, folder: folderName, date: dateStr, kind }, 200, corsHeaders);
}

/**
 * Lee las filas de la sesión en el orden canónico y les asigna el nombre final
 * dentro del ZIP. La deduplicación se calcula sobre la sesión COMPLETA, no por
 * lote: si "IMG_001.jpg" cae en el lote 1 y otra igual en el lote 3, al
 * descomprimir ambos ZIP en la misma carpeta seguirían sin pisarse.
 */
async function loadMirrorManifest(sessionId: string, env: Env) {
  await ensureMirrorPhotoSizeColumn(env);

  // El ORDER BY incluye r2_key porque date_str a solas no desempata: sin un
  // criterio estable, dos llamadas podían devolver órdenes distintos y los
  // lotes dejaban de cuadrar entre /plan y /package.
  const photos = await env.MIRAI_AI_DB.prepare(
    `SELECT r2_key, date_str, original_name, size_bytes
       FROM photos
      WHERE session_id = ?
      ORDER BY date_str ASC, r2_key ASC`
  ).bind(sessionId).all<any>();

  const rows = photos.results || [];

  // Map en vez de objeto plano: con {} un archivo llamado "constructor.jpg" o
  // "__proto__.jpg" leía una propiedad heredada de Object.prototype y el
  // contador salía NaN, corrompiendo el nombre dentro del ZIP.
  const usedNames = new Map();

  return rows.map(row => {
    const folder = (row.date_str || '').split('-').reverse().join('-') || 'sin-fecha';
    const ext = (row.original_name.split('.').pop() || 'jpg').toLowerCase();
    const baseName = row.original_name.replace(/\.[^.]+$/, '');
    const nameKey = `${folder}/${baseName}`;
    const seen = (usedNames.get(nameKey) || 0) + 1;
    usedNames.set(nameKey, seen);
    const finalName = seen > 1 ? `${baseName}_${seen}.${ext}` : `${baseName}.${ext}`;

    return {
      r2_key: row.r2_key,
      date: row.date_str,
      size_bytes: Number(row.size_bytes) || MIRROR_CONFIG.LEGACY_SIZE_ESTIMATE,
      path: `${folder}/${finalName}`
    };
  });
}

/**
 * Devuelve cómo se va a repartir la descarga, sin tocar R2. El front lo usa
 * para pintar "Lote 3 de 10" antes de empezar a bajar nada.
 */
export async function mirrorPlanSession(request: Request, env: Env, corsHeaders: Record<string, string>) {
  if (!env.MIRAI_AI_DB || !env.MIRAI_PHOTOS) {
    return jsonResponse({ success: false, error: 'Server configuration error' }, 500, corsHeaders);
  }

  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ success: false, error: 'No autorizado' }, 401, corsHeaders);

  let body;
  try { body = await request.json<any>(); } catch (e) {
    return jsonResponse({ success: false, error: 'Invalid JSON' }, 400, corsHeaders);
  }

  const { sessionId } = body;
  if (!sessionId) return jsonResponse({ success: false, error: 'Missing sessionId' }, 400, corsHeaders);

  const session = await getOwnedMirrorSession(sessionId, userDni, env);
  if (!session) return jsonResponse({ success: false, error: 'Sesión no encontrada' }, 404, corsHeaders);

  const manifest = await loadMirrorManifest(sessionId, env);
  if (!manifest.length) {
    return jsonResponse({ success: false, error: 'No photos in session' }, 400, corsHeaders);
  }

  const batches = buildMirrorBatches(manifest);

  return jsonResponse({
    success: true,
    totalFiles: manifest.length,
    totalBytes: manifest.reduce((acc, f) => acc + f.size_bytes, 0),
    batches: batches.map(b => ({ index: b.index, count: b.count, bytes: b.bytes })),
    // El ZIP unico va en streaming, asi que el peso no lo limita: solo el
    // numero de objetos que caben en los subrequests de una invocacion.
    singleZip: {
      available: manifest.length <= MIRROR_CONFIG.SINGLE_ZIP_MAX_FILES,
      maxFiles: MIRROR_CONFIG.SINGLE_ZIP_MAX_FILES
    }
  }, 200, corsHeaders);
}

export async function mirrorPackageSession(request: Request, env: Env, corsHeaders: Record<string, string>) {
  if (!env.MIRAI_AI_DB || !env.MIRAI_PHOTOS) {
    return jsonResponse({ success: false, error: 'Server configuration error' }, 500, corsHeaders);
  }

  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ success: false, error: 'No autorizado' }, 401, corsHeaders);

  let body;
  try { body = await request.json<any>(); } catch (e) {
    return jsonResponse({ success: false, error: 'Invalid JSON' }, 400, corsHeaders);
  }

  const { sessionId } = body;
  if (!sessionId) {
    return jsonResponse({ success: false, error: 'Missing sessionId' }, 400, corsHeaders);
  }

  const session = await getOwnedMirrorSession(sessionId, userDni, env);
  if (!session) {
    return jsonResponse({ success: false, error: 'Sesión no encontrada' }, 404, corsHeaders);
  }

  const manifest = await loadMirrorManifest(sessionId, env);
  if (!manifest.length) {
    return jsonResponse({ success: false, error: 'No photos in session' }, 400, corsHeaders);
  }

  const batches = buildMirrorBatches(manifest);
  // Sin `batch` se devuelve el primero: así una sesión de pocas fotos sigue
  // funcionando con el mismo contrato de antes.
  const batchIndex = Number.isInteger(body.batch) ? body.batch : 0;
  const batch = batches[batchIndex];
  if (!batch) {
    return jsonResponse({ success: false, error: 'Lote inexistente' }, 400, corsHeaders);
  }

  const slice = manifest.slice(batch.offset, batch.offset + batch.count);

  // Uno a uno, 200 objetos de R2 encadenaban 200 idas y vueltas y el lote
  // tardaba minutos. Con concurrencia acotada baja igual de memoria (el total
  // sigue limitado por BATCH_MAX_BYTES) pero en una fraccion del tiempo.
  const R2_CONCURRENCY = 6;
  const fetched = new Array(slice.length).fill(null);
  let nextIdx = 0;

  async function drainR2Queue() {
    while (true) {
      const i = nextIdx++;
      if (i >= slice.length) return;
      const entry = slice[i];
      const obj = await env.MIRAI_PHOTOS.get(entry.r2_key);
      if (!obj) continue;
      fetched[i] = {
        path: entry.path,
        data: await obj.arrayBuffer(),
        date: entry.date
      };
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(R2_CONCURRENCY, slice.length) }, drainR2Queue)
  );

  // El orden importa: los offsets del plan y el orden dentro del ZIP tienen que
  // seguir siendo los mismos que devuelve el manifiesto.
  const filesForZip = fetched.filter(Boolean);

  if (filesForZip.length === 0) {
    return jsonResponse({ success: false, error: 'All images failed to load from storage' }, 500, corsHeaders);
  }

  const zipBlob = createZipWithFolders(filesForZip.map(f => ({
    path: f.path,
    name: f.path.split('/').pop(),
    data: f.data,
    date: f.date,
    folder: f.path.split('/')[0]
  })));

  const suffix = batches.length > 1
    ? `_lote${String(batchIndex + 1).padStart(2, '0')}`
    : '';

  return new Response(zipBlob, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="mirai_mirror_${sessionId}${suffix}.zip"`,
      'Cache-Control': 'no-store',
      'X-Files-Count': String(filesForZip.length),
      'X-Batch-Index': String(batchIndex),
      'X-Batch-Total': String(batches.length)
    }
  });
}

/**
 * Emite el ZIP entero por el stream, un archivo cada vez. Nunca hay mas de un
 * trozo de R2 en memoria, asi que da igual que la sesion pese 5 GB: es lo que
 * permite entregar UN solo archivo en vez de repartirlo en lotes.
 *
 * Como el CRC de cada foto no se conoce hasta haberla leido entera, las
 * cabeceras locales salen con las medidas a cero y el flag de data descriptor,
 * y los valores de verdad se escriben detras de los datos.
 */
async function streamMirrorZip(env: Env, manifest: any[], writable: WritableStream<Uint8Array>) {
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const centralEntries: any[] = [];
  let offset = 0;

  // `await` en cada escritura: es lo que aplica contrapresion. Sin el, el
  // Worker leeria R2 mucho mas rapido de lo que el navegador consume y volveria
  // a acumular el ZIP entero en memoria, que es justo lo que se quiere evitar.
  const emit = async (bytes: Uint8Array) => {
    await writer.write(bytes);
    offset += bytes.length;
  };

  try {
    // --- Carpetas ---
    const folders = new Set<string>();
    for (const entry of manifest) {
      const slash = entry.path.lastIndexOf('/');
      if (slash > 0) folders.add(entry.path.substring(0, slash) + '/');
    }
    for (const folder of folders) {
      const nameBytes = enc.encode(folder);
      const localOffset = offset;
      await emit(buildLocalHeader(nameBytes, 0, 0, 0));
      centralEntries.push(buildCentralHeader(nameBytes, 0, 0, 0, 0x10, localOffset));
    }

    // --- Archivos ---
    for (const entry of manifest) {
      const obj = await env.MIRAI_PHOTOS.get(entry.r2_key);
      if (!obj) continue; // el objeto ya no esta: se omite, como en los lotes

      const nameBytes = enc.encode(entry.path);
      const localOffset = offset;
      await emit(buildLocalHeader(nameBytes, 0, 0, ZIP_FLAG_DATA_DESCRIPTOR));

      let running = 0xFFFFFFFF;
      let size = 0;
      const reader = obj.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // El CRC se calcula ANTES de entregar el trozo al stream.
        running = crc32Update(running, value);
        size += value.length;
        await emit(value);
      }
      const crc = (running ^ 0xFFFFFFFF) >>> 0;

      await emit(buildDataDescriptor(crc, size));
      centralEntries.push(
        buildCentralHeader(nameBytes, crc, size, size, 0, localOffset, ZIP_FLAG_DATA_DESCRIPTOR)
      );
    }

    // --- Indice final ---
    const cdStart = offset;
    let cdSize = 0;
    for (const central of centralEntries) {
      await emit(central);
      cdSize += central.length;
    }
    for (const tail of buildEndOfCentralDirectory(centralEntries.length, cdSize, cdStart)) {
      await emit(tail);
    }

    await writer.close();
  } catch (error) {
    // A estas alturas el navegador ya recibio el 200 y parte del ZIP: no hay
    // forma de convertir esto en un error HTTP. Se aborta el stream para que la
    // descarga salga marcada como fallida en vez de entregar un ZIP truncado
    // con pinta de bueno.
    console.error('streamMirrorZip error:', error && error.message);
    try { await writer.abort(error); } catch (_) {}
  }
}

/**
 * Descarga de la sesion completa en UN solo ZIP. Es GET a proposito: al ser una
 * navegacion normal el navegador escribe directo a disco y no pasa por memoria
 * de la pestania (que es lo que la tumbaba al encadenar lotes). La cookie de
 * sesion es SameSite=Strict y esto es navegacion del propio sitio, asi que
 * viaja igual y la propiedad se sigue comprobando.
 */
export async function mirrorDownloadAll(request: Request, env: Env, corsHeaders: Record<string, string>) {
  if (!env.MIRAI_AI_DB || !env.MIRAI_PHOTOS) {
    return jsonResponse({ success: false, error: 'Server configuration error' }, 500, corsHeaders);
  }

  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ success: false, error: 'No autorizado' }, 401, corsHeaders);

  const sessionId = new URL(request.url).searchParams.get('sessionId');
  if (!sessionId) return jsonResponse({ success: false, error: 'Missing sessionId' }, 400, corsHeaders);

  const session = await getOwnedMirrorSession(sessionId, userDni, env);
  if (!session) return jsonResponse({ success: false, error: 'Sesión no encontrada' }, 404, corsHeaders);

  const manifest = await loadMirrorManifest(sessionId, env);
  if (!manifest.length) {
    return jsonResponse({ success: false, error: 'No photos in session' }, 400, corsHeaders);
  }

  // Se comprueba aqui y no a mitad del stream: una vez enviada la cabecera ya
  // no se puede devolver un error legible.
  if (manifest.length > MIRROR_CONFIG.SINGLE_ZIP_MAX_FILES) {
    return jsonResponse({
      success: false,
      error: `Demasiados archivos para un solo ZIP (${manifest.length}). ` +
             `El maximo es ${MIRROR_CONFIG.SINGLE_ZIP_MAX_FILES}; usa la descarga por lotes.`
    }, 413, corsHeaders);
  }

  const { readable, writable } = new TransformStream();
  // Sin await: el cuerpo se va llenando mientras el navegador lo consume.
  streamMirrorZip(env, manifest, writable);

  return new Response(readable, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="mirai_mirror_${sessionId}.zip"`,
      'Cache-Control': 'no-store',
      'X-Files-Count': String(manifest.length)
    }
  });
}

export async function mirrorCleanupSession(request: Request, env: Env, corsHeaders: Record<string, string>) {
  if (!env.MIRAI_AI_DB || !env.MIRAI_PHOTOS) {
    return jsonResponse({ success: true }, 200, corsHeaders);
  }

  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ success: false, error: 'No autorizado' }, 401, corsHeaders);

  let body;
  try { body = await request.json<any>(); } catch (e) {
    return jsonResponse({ success: false, error: 'Invalid JSON' }, 400, corsHeaders);
  }

  const { sessionId } = body;
  if (!sessionId) return jsonResponse({ success: false, error: 'Missing sessionId' }, 400, corsHeaders);

  // Sin esta comprobación, cualquiera borraba la sesión de fotos de cualquiera.
  const session = await getOwnedMirrorSession(sessionId, userDni, env);
  if (!session) return jsonResponse({ success: false, error: 'Sesión no encontrada' }, 404, corsHeaders);

  const photos = await env.MIRAI_AI_DB.prepare(
    `SELECT r2_key FROM photos WHERE session_id = ?`
  ).bind(sessionId).all<any>();

  if (photos.results) {
    for (const row of photos.results) {
      try { await env.MIRAI_PHOTOS.delete(row.r2_key); } catch (_) {}
    }
  }

  await env.MIRAI_AI_DB.prepare(`DELETE FROM photos WHERE session_id = ?`).bind(sessionId).run();
  await env.MIRAI_AI_DB.prepare(`DELETE FROM photo_sessions WHERE session_id = ?`).bind(sessionId).run();

  return jsonResponse({ success: true }, 200, corsHeaders);
}

// ============================================
// EXTRAER FECHA EXIF (solo JPEG)
// ============================================
async function extractEXIFDate(file: File) {
  try {
    // Antes leia el fichero entero para mirar solo los primeros 64 KB. Con una
    // imagen de 15 MB se notaba poco; con video de 25 MB es una copia integra
    // en un isolate de 128 MB.
    const head = await file.slice(0, 65536).arrayBuffer();
    const uint8 = new Uint8Array(head);

    // Solo JPEG (FF D8 FF)
    if (uint8[0] !== 0xFF || uint8[1] !== 0xD8 || uint8[2] !== 0xFF) return null;

    const limit = uint8.length;
    for (let i = 2; i < limit - 4; i++) {
      if (uint8[i] === 0xFF && uint8[i + 1] === 0xE1) {
        const segLen = (uint8[i + 2] << 8) | uint8[i + 3];
        const seg = uint8.slice(i + 4, Math.min(i + 4 + segLen, uint8.length));
        const text = new TextDecoder('latin1').decode(seg);
        const m = text.match(/(\d{4}):(\d{2}):(\d{2}) \d{2}:\d{2}:\d{2}/);
        if (m) return `${m[1]}-${m[2]}-${m[3]}`;
      }
    }
  } catch (e) {
    console.warn('EXIF read error:', e.message);
  }
  return null;
}

// ============================================
// EXTRAER FECHA DE GRABACIÓN DE UN VÍDEO (MP4/MOV)
// ============================================

// MP4/QuickTime cuentan los segundos desde 1904-01-01, no desde 1970.
const MP4_EPOCH_OFFSET = 2082844800;

/**
 * Lee `creation_time` del átomo `mvhd`. No se parsea el árbol de átomos
 * completo a propósito: `moov` puede estar al principio (iPhone) o al final
 * (muchos Android), así que se escanea la firma ASCII en la cabecera y en la
 * cola, que es donde cae en ambos casos.
 */
async function extractVideoDate(file: File) {
  const WINDOW = 262144; // 256 KB por extremo

  const scan = (uint8: Uint8Array) => {
    // 'mvhd' = 6D 76 68 64
    for (let i = 0; i < uint8.length - 20; i++) {
      if (uint8[i] !== 0x6D || uint8[i + 1] !== 0x76 ||
          uint8[i + 2] !== 0x68 || uint8[i + 3] !== 0x64) continue;

      const view = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength);
      const version = uint8[i + 4];
      let seconds;

      if (version === 0) {
        seconds = view.getUint32(i + 8, false);
      } else if (version === 1) {
        // 64 bits: la parte alta es 0 en cualquier fecha real, pero se respeta.
        const hi = view.getUint32(i + 8, false);
        const lo = view.getUint32(i + 12, false);
        seconds = hi * 4294967296 + lo;
      } else {
        continue;
      }

      if (!seconds) continue;
      const ms = (seconds - MP4_EPOCH_OFFSET) * 1000;
      const d = new Date(ms);
      const year = d.getUTCFullYear();
      // Un mvhd sin fecha real deja 0 o basura; se descarta fuera de rango.
      if (year >= 2000 && year <= new Date().getUTCFullYear() + 1) {
        return d.toISOString().split('T')[0];
      }
    }
    return null;
  };

  try {
    const head = new Uint8Array(await file.slice(0, WINDOW).arrayBuffer());
    const fromHead = scan(head);
    if (fromHead) return fromHead;

    if (file.size > WINDOW) {
      const tail = new Uint8Array(await file.slice(Math.max(0, file.size - WINDOW)).arrayBuffer());
      return scan(tail);
    }
  } catch (e) {
    console.warn('Video date read error:', e.message);
  }
  return null;
}

// ============================================
// EXTRAER FECHA DEL NOMBRE DE ARCHIVO
// ============================================
function extractDateFromFilename(filename: string) {
  let m;

  // WhatsApp: IMG-20240115-WA0001.jpg, VID-20240115-WA0001.mp4, STK-20240115-WA0001.webp
  m = filename.match(/(?:IMG|VID|PHOTO|STK)-(\d{4})(\d{2})(\d{2})-/i);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // Telegram: photo_2024-01-15_14-30-22.jpg
  m = filename.match(/photo_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/i);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // Screenshot: Screenshot_20240115-143022.png o Screenshot_2024-01-15-14-30-22.png
  m = filename.match(/Screenshot[_-](\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})/i);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // Patrón español: 24-may.-20-02-02-06-25 → DD-MMM.-YY-HH-MM-SS-##
  m = filename.match(/(\d{1,2})-(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\.?-(\d{2,4})-(\d{2})-(\d{2})-(\d{2})/i);
  if (m) {
    const monthMap: Record<string, string> = { ene:'01', feb:'02', mar:'03', abr:'04', may:'05', jun:'06', jul:'07', ago:'08', sep:'09', oct:'10', nov:'11', dic:'12' };
    const mon = monthMap[m[2].toLowerCase()];
    let yr = +m[3];
    if (yr < 100) yr += 2000;
    if (mon) return `${yr}-${mon}-${String(m[1]).padStart(2, '0')}`;
  }

  // YYYY-MM-DD o YYYY/MM/DD
  m = filename.match(/(\d{4})[-\/](\d{2})[-\/](\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // DD-MM-YYYY o DD/MM/YYYY
  m = filename.match(/(\d{2})[-\/](\d{2})[-\/](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  // YYYYMMDD (ej. en nombres genéricos)
  m = filename.match(/(\d{4})(\d{2})(\d{2})/);
  if (m) {
    const yr = +m[1];
    if (yr >= 2000 && yr <= 2099) return `${m[1]}-${m[2]}-${m[3]}`;
  }

  return null;
}

// ============================================
// GENERADOR DE ZIP (CORREGIDO)
// ============================================
function createZipWithFolders(files: any[]) {
  const enc = new TextEncoder();
  const localEntries: any[] = [];   // { headerBytes, dataBytes }
  const centralEntries: any[] = []; // Uint8Array
  let dataOffset = 0;        // offset acumulado de la sección de datos locales

  // --- Entradas de carpetas ---
  const folders = new Set<string>();
  for (const f of files) {
    const slash = f.path.lastIndexOf('/');
    if (slash > 0) folders.add(f.path.substring(0, slash) + '/');
  }

  for (const folder of folders) {
    const nameBytes = enc.encode(folder);
    const local = buildLocalHeader(nameBytes, 0, 0, 0);

    const relOffset = dataOffset;
    dataOffset += local.length; // carpetas no tienen datos

    localEntries.push({ header: local, data: new Uint8Array(0) });
    centralEntries.push(buildCentralHeader(nameBytes, 0, 0, 0, 0x10 /* dir attr */, relOffset));
  }

  // --- Entradas de archivos ---
  for (const file of files) {
    const nameBytes = enc.encode(file.path);
    const fileData = new Uint8Array(file.data);
    const crc = crc32(fileData);
    const size = fileData.length;
    const local = buildLocalHeader(nameBytes, crc, size, 0);

    const relOffset = dataOffset;
    dataOffset += local.length + size;

    localEntries.push({ header: local, data: fileData });
    centralEntries.push(buildCentralHeader(nameBytes, crc, size, size, 0, relOffset));
  }

  // --- Central Directory ---
  const cdStart = dataOffset; // offset donde comienza el CD (justo después de todos los datos locales)
  let cdSize = 0;
  for (const c of centralEntries) cdSize += c.length;

  // --- Ensamblar ---
  const parts: any[] = [];
  for (const e of localEntries) {
    parts.push(e.header);
    parts.push(e.data);
  }
  for (const c of centralEntries) parts.push(c);
  for (const tail of buildEndOfCentralDirectory(centralEntries.length, cdSize, cdStart)) {
    parts.push(tail);
  }

  return new Blob(parts, { type: 'application/zip' });
}
