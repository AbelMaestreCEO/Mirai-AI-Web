/* ============================================
   MIRAI AI - Ventas: anuncios, compradores, transacciones y facturas

   ============================================ */
import { CEDULA_RE, normalizeCedula, requireAuth } from '../lib/auth';
import { jsonResponse } from '../lib/http';
import { extractPngFromIco, generateInvoicePdf } from '../lib/invoice-pdf';

/**
 * GET /api/sales/listings
 * Lista los artículos que el usuario puso a la venta.
 */
export async function handleSaleListingsList(request, env, corsHeaders) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  try {
    const { results } = await env.MIRAI_AI_DB.prepare(`
      SELECT id, product_id, product_name, product_sku, photo_r2_key,
             quantity, unit_price, status, created_at, updated_at
      FROM sale_listings
      WHERE user_dni = ?
      ORDER BY created_at DESC
    `).bind(userDni.toUpperCase()).all();

    return jsonResponse(results, 200, corsHeaders);
  } catch (error) {
    console.error('[Sales] Error al listar listings:', error);
    return jsonResponse({ error: 'Error al obtener artículos en venta' }, 500, corsHeaders);
  }
}

/**
 * POST /api/sales/listings
 * Pone un artículo del inventario a la venta.
 * Body: { product_id, quantity, unit_price? }
 */
export async function handleSaleListingCreate(request, env, corsHeaders) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  let body;
  try { body = await request.json(); } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400, corsHeaders);
  }

  const { product_id, quantity, unit_price } = body;
  if (!product_id) return jsonResponse({ error: 'product_id requerido' }, 400, corsHeaders);

  const qty = parseInt(quantity, 10);
  if (!qty || qty <= 0) return jsonResponse({ error: 'La cantidad debe ser mayor a 0' }, 400, corsHeaders);

  try {
    const product = await env.MIRAI_AI_DB.prepare(
      'SELECT id, name, sku, unit_price, photo_r2_key, quantity FROM inventory_products WHERE id = ? AND user_dni = ?'
    ).bind(product_id, userDni).first();

    if (!product) return jsonResponse({ error: 'Producto no encontrado en tu inventario' }, 404, corsHeaders);
    if (qty > product.quantity) {
      return jsonResponse({ error: `Solo hay ${product.quantity} unidades disponibles en inventario` }, 400, corsHeaders);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const price = unit_price != null && unit_price !== '' ? parseFloat(unit_price) : (product.unit_price || 0);

    await env.MIRAI_AI_DB.prepare(`
      INSERT INTO sale_listings
        (id, user_dni, product_id, product_name, product_sku, photo_r2_key,
         quantity, unit_price, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).bind(
      id, userDni.toUpperCase(), product.id, product.name, product.sku || '',
      product.photo_r2_key || null, qty, price, now, now
    ).run();

    return jsonResponse({ success: true, id }, 201, corsHeaders);
  } catch (error) {
    console.error('[Sales] Error al crear listing:', error);
    return jsonResponse({ error: 'Error al poner el artículo a la venta', details: error.message }, 500, corsHeaders);
  }
}

/**
 * PUT /api/sales/listings/:id
 * Actualiza cantidad, precio o estado (p. ej. 'retirado') de un listing.
 */
export async function handleSaleListingUpdate(request, env, corsHeaders, listingId) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  const existing = await env.MIRAI_AI_DB.prepare(
    'SELECT id FROM sale_listings WHERE id = ? AND user_dni = ?'
  ).bind(listingId, userDni.toUpperCase()).first();
  if (!existing) return jsonResponse({ error: 'Artículo en venta no encontrado' }, 404, corsHeaders);

  let body;
  try { body = await request.json(); } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400, corsHeaders);
  }

  const VALID_STATUS = ['active', 'agotado', 'retirado'];
  if (body.status !== undefined && !VALID_STATUS.includes(body.status)) {
    return jsonResponse({ error: `Estado inválido: ${body.status}` }, 400, corsHeaders);
  }

  const fields = [];
  const values = [];
  const addField = (col, val) => { fields.push(`${col} = ?`); values.push(val); };

  if (body.quantity !== undefined) addField('quantity', parseInt(body.quantity, 10) || 0);
  if (body.unit_price !== undefined) addField('unit_price', parseFloat(body.unit_price) || 0);
  if (body.status !== undefined) addField('status', body.status);

  if (fields.length === 0) return jsonResponse({ error: 'Sin campos para actualizar' }, 400, corsHeaders);

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(listingId, userDni.toUpperCase());

  try {
    await env.MIRAI_AI_DB.prepare(
      `UPDATE sale_listings SET ${fields.join(', ')} WHERE id = ? AND user_dni = ?`
    ).bind(...values).run();
    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (error) {
    console.error('[Sales] Error al actualizar listing:', error);
    return jsonResponse({ error: 'Error al actualizar artículo en venta', details: error.message }, 500, corsHeaders);
  }
}

/**
 * DELETE /api/sales/listings/:id
 */
export async function handleSaleListingDelete(request, env, corsHeaders, listingId) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  const existing = await env.MIRAI_AI_DB.prepare(
    'SELECT id FROM sale_listings WHERE id = ? AND user_dni = ?'
  ).bind(listingId, userDni.toUpperCase()).first();
  if (!existing) return jsonResponse({ error: 'Artículo en venta no encontrado' }, 404, corsHeaders);

  try {
    await env.MIRAI_AI_DB.prepare(
      'DELETE FROM sale_listings WHERE id = ? AND user_dni = ?'
    ).bind(listingId, userDni.toUpperCase()).run();
    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (error) {
    console.error('[Sales] Error al eliminar listing:', error);
    return jsonResponse({ error: 'Error al eliminar artículo en venta', details: error.message }, 500, corsHeaders);
  }
}

/**
 * GET /api/sales/buyers
 * Lista compradores del usuario. has_account se calcula al vuelo
 * comprobando si la cédula coincide con el dni de un usuario registrado.
 */
export async function handleSaleBuyersList(request, env, corsHeaders) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  try {
    const { results } = await env.MIRAI_AI_DB.prepare(`
      SELECT b.id, b.first_name, b.last_name, b.cedula, b.phone, b.is_favorite,
             b.created_at, b.updated_at,
             CASE WHEN u.dni IS NOT NULL THEN 1 ELSE 0 END AS has_account
      FROM sale_buyers b
      LEFT JOIN users u ON u.dni = b.cedula
      WHERE b.user_dni = ?
      ORDER BY b.is_favorite DESC, b.last_name, b.first_name
    `).bind(userDni.toUpperCase()).all();

    return jsonResponse(results, 200, corsHeaders);
  } catch (error) {
    console.error('[Sales] Error al listar compradores:', error);
    return jsonResponse({ error: 'Error al obtener compradores' }, 500, corsHeaders);
  }
}

/**
 * POST /api/sales/buyers
 * Body: { first_name, last_name, cedula, phone? }
 * cedula debe tener formato V-00000000 (letra de nacionalidad - número).
 */
export async function handleSaleBuyerCreate(request, env, corsHeaders) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  let body;
  try { body = await request.json(); } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400, corsHeaders);
  }

  const { first_name, last_name, phone } = body;
  const cedula = normalizeCedula(body.cedula);

  if (!first_name || !first_name.trim() || !last_name || !last_name.trim()) {
    return jsonResponse({ error: 'Nombre y apellido son obligatorios' }, 400, corsHeaders);
  }
  if (!CEDULA_RE.test(cedula)) {
    return jsonResponse({ error: 'Cédula inválida. Formato esperado: V-00000000' }, 400, corsHeaders);
  }

  try {
    const dup = await env.MIRAI_AI_DB.prepare(
      'SELECT id FROM sale_buyers WHERE user_dni = ? AND cedula = ?'
    ).bind(userDni.toUpperCase(), cedula).first();
    if (dup) return jsonResponse({ error: 'Ya registraste un comprador con esa cédula' }, 409, corsHeaders);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await env.MIRAI_AI_DB.prepare(`
      INSERT INTO sale_buyers
        (id, user_dni, first_name, last_name, cedula, phone, is_favorite, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).bind(
      id, userDni.toUpperCase(), first_name.trim(), last_name.trim(), cedula, (phone || '').trim(), now, now
    ).run();

    const hasAccount = await env.MIRAI_AI_DB.prepare('SELECT dni FROM users WHERE dni = ?').bind(cedula).first();

    return jsonResponse({ success: true, id, has_account: !!hasAccount }, 201, corsHeaders);
  } catch (error) {
    console.error('[Sales] Error al crear comprador:', error);
    return jsonResponse({ error: 'Error al registrar comprador', details: error.message }, 500, corsHeaders);
  }
}

/**
 * PUT /api/sales/buyers/:id
 * Body: Partial<{ first_name, last_name, cedula, phone, is_favorite }>
 */
export async function handleSaleBuyerUpdate(request, env, corsHeaders, buyerId) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  const existing = await env.MIRAI_AI_DB.prepare(
    'SELECT id FROM sale_buyers WHERE id = ? AND user_dni = ?'
  ).bind(buyerId, userDni.toUpperCase()).first();
  if (!existing) return jsonResponse({ error: 'Comprador no encontrado' }, 404, corsHeaders);

  let body;
  try { body = await request.json(); } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400, corsHeaders);
  }

  const fields = [];
  const values = [];
  const addField = (col, val) => { fields.push(`${col} = ?`); values.push(val); };

  if (body.first_name !== undefined) addField('first_name', (body.first_name || '').trim());
  if (body.last_name !== undefined) addField('last_name', (body.last_name || '').trim());
  if (body.phone !== undefined) addField('phone', (body.phone || '').trim());
  if (body.is_favorite !== undefined) addField('is_favorite', body.is_favorite ? 1 : 0);
  if (body.cedula !== undefined) {
    const cedula = normalizeCedula(body.cedula);
    if (!CEDULA_RE.test(cedula)) {
      return jsonResponse({ error: 'Cédula inválida. Formato esperado: V-00000000' }, 400, corsHeaders);
    }
    addField('cedula', cedula);
  }

  if (fields.length === 0) return jsonResponse({ error: 'Sin campos para actualizar' }, 400, corsHeaders);

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(buyerId, userDni.toUpperCase());

  try {
    await env.MIRAI_AI_DB.prepare(
      `UPDATE sale_buyers SET ${fields.join(', ')} WHERE id = ? AND user_dni = ?`
    ).bind(...values).run();
    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (error) {
    console.error('[Sales] Error al actualizar comprador:', error);
    return jsonResponse({ error: 'Error al actualizar comprador', details: error.message }, 500, corsHeaders);
  }
}

/**
 * DELETE /api/sales/buyers/:id
 */
export async function handleSaleBuyerDelete(request, env, corsHeaders, buyerId) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  const existing = await env.MIRAI_AI_DB.prepare(
    'SELECT id FROM sale_buyers WHERE id = ? AND user_dni = ?'
  ).bind(buyerId, userDni.toUpperCase()).first();
  if (!existing) return jsonResponse({ error: 'Comprador no encontrado' }, 404, corsHeaders);

  try {
    await env.MIRAI_AI_DB.prepare(
      'DELETE FROM sale_buyers WHERE id = ? AND user_dni = ?'
    ).bind(buyerId, userDni.toUpperCase()).run();
    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (error) {
    console.error('[Sales] Error al eliminar comprador:', error);
    return jsonResponse({ error: 'Error al eliminar comprador', details: error.message }, 500, corsHeaders);
  }
}

/**
 * GET /api/sales/transactions?status=pendiente|pagado|cancelado
 */
export async function handleSaleTransactionsList(request, env, corsHeaders) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const VALID_STATUS = ['pendiente', 'pagado', 'cancelado'];
  if (status && !VALID_STATUS.includes(status)) {
    return jsonResponse({ error: `Estado inválido: ${status}` }, 400, corsHeaders);
  }

  try {
    const query = `
      SELECT t.id, t.buyer_id, t.listing_id, t.product_name, t.quantity,
             t.unit_price, t.total_amount, t.status, t.notes,
             t.created_at, t.paid_at,
             b.first_name AS buyer_first_name, b.last_name AS buyer_last_name,
             b.cedula AS buyer_cedula, b.phone AS buyer_phone
      FROM sale_transactions t
      JOIN sale_buyers b ON b.id = t.buyer_id
      WHERE t.user_dni = ? ${status ? 'AND t.status = ?' : ''}
      ORDER BY t.created_at DESC
    `;
    const stmt = status
      ? env.MIRAI_AI_DB.prepare(query).bind(userDni.toUpperCase(), status)
      : env.MIRAI_AI_DB.prepare(query).bind(userDni.toUpperCase());

    const { results } = await stmt.all();
    return jsonResponse(results, 200, corsHeaders);
  } catch (error) {
    console.error('[Sales] Error al listar transacciones:', error);
    return jsonResponse({ error: 'Error al obtener compras' }, 500, corsHeaders);
  }
}

/**
 * POST /api/sales/transactions
 * Registra una compra: descuenta del inventario y del listing.
 * Body: { listing_id, buyer_id, quantity, notes? }
 */
export async function handleSaleTransactionCreate(request, env, corsHeaders) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  let body;
  try { body = await request.json(); } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400, corsHeaders);
  }

  const { listing_id, buyer_id, notes } = body;
  const qty = parseInt(body.quantity, 10);

  if (!listing_id || !buyer_id) {
    return jsonResponse({ error: 'listing_id y buyer_id son obligatorios' }, 400, corsHeaders);
  }
  if (!qty || qty <= 0) {
    return jsonResponse({ error: 'La cantidad debe ser mayor a 0' }, 400, corsHeaders);
  }

  try {
    const listing = await env.MIRAI_AI_DB.prepare(
      'SELECT id, product_id, product_name, quantity, unit_price, status FROM sale_listings WHERE id = ? AND user_dni = ?'
    ).bind(listing_id, userDni.toUpperCase()).first();
    if (!listing) return jsonResponse({ error: 'Artículo en venta no encontrado' }, 404, corsHeaders);
    if (listing.status !== 'active') return jsonResponse({ error: 'Este artículo ya no está disponible para la venta' }, 400, corsHeaders);
    if (qty > listing.quantity) {
      return jsonResponse({ error: `Solo hay ${listing.quantity} unidades disponibles` }, 400, corsHeaders);
    }

    const buyer = await env.MIRAI_AI_DB.prepare(`
      SELECT b.id, b.first_name, b.last_name, b.cedula, b.phone,
             CASE WHEN u.dni IS NOT NULL THEN 1 ELSE 0 END AS has_account
      FROM sale_buyers b
      LEFT JOIN users u ON u.dni = b.cedula
      WHERE b.id = ? AND b.user_dni = ?
    `).bind(buyer_id, userDni.toUpperCase()).first();
    if (!buyer) return jsonResponse({ error: 'Comprador no encontrado' }, 404, corsHeaders);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const totalAmount = qty * listing.unit_price;
    const newListingQty = listing.quantity - qty;

    // Los tres escritos van en un batch: D1 lo ejecuta como una transacción
    // única, así que ya no puede quedar la venta registrada sin descontar el
    // stock (o al revés) si algo falla a mitad.
    await env.MIRAI_AI_DB.batch([
      env.MIRAI_AI_DB.prepare(`
        INSERT INTO sale_transactions
          (id, user_dni, buyer_id, listing_id, product_name, quantity,
           unit_price, total_amount, status, notes, created_at, paid_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?, NULL)
      `).bind(
        id, userDni.toUpperCase(), buyer_id, listing_id, listing.product_name,
        qty, listing.unit_price, totalAmount, (notes || '').trim(), now
      ),
      // Descontar del listing y del inventario original
      env.MIRAI_AI_DB.prepare(`
        UPDATE sale_listings SET quantity = ?, status = ?, updated_at = ? WHERE id = ?
      `).bind(newListingQty, newListingQty <= 0 ? 'agotado' : 'active', now, listing_id),
      env.MIRAI_AI_DB.prepare(`
        UPDATE inventory_products SET quantity = MAX(0, quantity - ?), updated_at = ? WHERE id = ? AND user_dni = ?
      `).bind(qty, now, listing.product_id, userDni.toUpperCase()),
    ]);

    // Generar y guardar la factura PDF (D1 + R2). Un fallo aquí no debe
    // revertir la venta, que ya quedó registrada arriba.
    let invoice = null;
    try {
      invoice = await createSaleInvoice(env, request, userDni.toUpperCase(), {
        transactionId: id, listing, buyer, quantity: qty, unitPrice: listing.unit_price,
      });
    } catch (invoiceError) {
      console.error('[Sales] Error al generar la factura:', invoiceError);
    }

    return jsonResponse({
      success: true, id, total_amount: totalAmount,
      invoice_id: invoice?.id || null, invoice_number: invoice?.invoiceNumber || null,
    }, 201, corsHeaders);
  } catch (error) {
    console.error('[Sales] Error al crear transacción:', error);
    return jsonResponse({ error: 'Error al registrar la compra', details: error.message }, 500, corsHeaders);
  }
}

/**
 * Descarga los bytes de un asset estático servido por este mismo Worker
 * (public/), reutilizando el mecanismo de Cloudflare Workers Assets.
 */
async function fetchAssetBytes(request, path) {
  const url = new URL(path, request.url);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`No se pudo cargar el asset ${path} (HTTP ${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Genera la factura PDF de una venta recién creada, la sube a R2
 * (bucket MIRAI_AI_ASSETS, prefijo invoices/) y guarda sus metadatos en D1.
 */
async function createSaleInvoice(env, request, userDni, { transactionId, listing, buyer, quantity, unitPrice }) {
  const seller = await env.MIRAI_AI_DB.prepare(
    'SELECT dni, first_name, last_name FROM users WHERE dni = ?'
  ).bind(userDni).first();
  const sellerName = seller ? `${seller.first_name || ''} ${seller.last_name || ''}`.trim() : userDni;

  // El correlativo salía de COUNT(*)+1, así que borrar una factura reutilizaba
  // su número y dos ventas simultáneas obtenían el mismo. Ahora se toma el mayor
  // correlativo ya emitido: monótono y estable frente a borrados.
  const lastRow = await env.MIRAI_AI_DB.prepare(
    `SELECT MAX(CAST(SUBSTR(invoice_number, 5) AS INTEGER)) AS last_seq
       FROM sale_invoices
      WHERE user_dni = ? AND invoice_number LIKE 'FAC-%'`
  ).bind(userDni).first();
  const invoiceNumber = `FAC-${String((lastRow?.last_seq || 0) + 1).padStart(6, '0')}`;

  const subtotal = quantity * unitPrice;
  const taxAmount = subtotal * 0.16;
  const total = subtotal + taxAmount;

  let logoPngBytes = null;
  let companyLogoPngBytes = null;
  try {
    const [faviconBytes, corpLogoBytes] = await Promise.all([
      fetchAssetBytes(request, '/favicon.ico'),
      fetchAssetBytes(request, '/corp_icon.png'),
    ]);
    logoPngBytes = extractPngFromIco(faviconBytes);
    companyLogoPngBytes = corpLogoBytes;
  } catch (assetError) {
    console.error('[Sales] No se pudieron cargar los logos para la factura:', assetError);
  }

  let productImageBytes = null;
  let productImageIsPng = true;
  if (listing.photo_r2_key) {
    try {
      const obj = await env.MIRAI_AI_ASSETS.get(listing.photo_r2_key);
      if (obj) {
        productImageBytes = new Uint8Array(await obj.arrayBuffer());
        productImageIsPng = (obj.httpMetadata?.contentType || '').includes('png');
      }
    } catch (imgError) {
      console.error('[Sales] No se pudo cargar la imagen del producto para la factura:', imgError);
    }
  }

  const createdAt = new Date().toISOString();
  const pdfBytes = await generateInvoicePdf({
    invoiceNumber, transactionId, createdAt,
    sellerName, sellerDni: userDni,
    buyer: {
      first_name: buyer.first_name, last_name: buyer.last_name,
      cedula: buyer.cedula, phone: buyer.phone, has_account: !!buyer.has_account,
    },
    product: { name: listing.product_name, unit_price: unitPrice, quantity },
    subtotal, taxAmount, total,
    logoPngBytes, companyLogoPngBytes, productImageBytes, productImageIsPng,
  });

  const id = crypto.randomUUID();
  const r2Key = `invoices/${userDni}/${id}.pdf`;

  await env.MIRAI_AI_ASSETS.put(r2Key, pdfBytes, {
    httpMetadata: { contentType: 'application/pdf' },
    customMetadata: { transactionId, invoiceNumber, userDni },
  });

  await env.MIRAI_AI_DB.prepare(`
    INSERT INTO sale_invoices
      (id, user_dni, transaction_id, buyer_id, invoice_number, r2_key,
       product_name, quantity, unit_price, subtotal, tax_amount, total_amount, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, userDni, transactionId, buyer.id, invoiceNumber, r2Key,
    listing.product_name, quantity, unitPrice, subtotal, taxAmount, total, createdAt
  ).run();

  return { id, invoiceNumber, r2Key };
}

/**
 * GET /api/sales/invoices
 * Lista todas las facturas generadas por el usuario.
 */
export async function handleSaleInvoicesList(request, env, corsHeaders) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  try {
    const { results } = await env.MIRAI_AI_DB.prepare(`
      SELECT i.id, i.transaction_id, i.invoice_number, i.product_name, i.quantity,
             i.unit_price, i.subtotal, i.tax_amount, i.total_amount, i.created_at,
             b.first_name AS buyer_first_name, b.last_name AS buyer_last_name, b.cedula AS buyer_cedula
      FROM sale_invoices i
      JOIN sale_buyers b ON b.id = i.buyer_id
      WHERE i.user_dni = ?
      ORDER BY i.created_at DESC
    `).bind(userDni.toUpperCase()).all();

    return jsonResponse(results, 200, corsHeaders);
  } catch (error) {
    console.error('[Sales] Error al listar facturas:', error);
    return jsonResponse({ error: 'Error al obtener facturas' }, 500, corsHeaders);
  }
}

/**
 * GET /api/sales/invoices/:id/pdf
 * Sirve el PDF de la factura desde R2. Solo el dueño puede verlo/descargarlo.
 */
export async function handleSaleInvoicePdf(request, env, corsHeaders, invoiceId) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  const invoice = await env.MIRAI_AI_DB.prepare(
    'SELECT r2_key, invoice_number FROM sale_invoices WHERE id = ? AND user_dni = ?'
  ).bind(invoiceId, userDni.toUpperCase()).first();
  if (!invoice) return jsonResponse({ error: 'Factura no encontrada' }, 404, corsHeaders);

  const object = await env.MIRAI_AI_ASSETS.get(invoice.r2_key);
  if (!object) return jsonResponse({ error: 'El archivo de la factura no está disponible' }, 404, corsHeaders);

  const headers = new Headers(corsHeaders);
  headers.set('Content-Type', 'application/pdf');
  headers.set('Content-Disposition', `inline; filename="${invoice.invoice_number}.pdf"`);
  headers.set('Cache-Control', 'private, no-cache');

  return new Response(object.body, { headers });
}

/**
 * PUT /api/sales/transactions/:id
 * Body: { status: 'pagado' | 'cancelado' }
 * Al cancelar, restaura el stock descontado al listing y al inventario.
 */
export async function handleSaleTransactionUpdate(request, env, corsHeaders, txId) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  const tx = await env.MIRAI_AI_DB.prepare(
    'SELECT id, listing_id, quantity, status FROM sale_transactions WHERE id = ? AND user_dni = ?'
  ).bind(txId, userDni.toUpperCase()).first();
  if (!tx) return jsonResponse({ error: 'Transacción no encontrada' }, 404, corsHeaders);

  let body;
  try { body = await request.json(); } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400, corsHeaders);
  }

  const VALID_STATUS = ['pendiente', 'pagado', 'cancelado'];
  if (!body.status || !VALID_STATUS.includes(body.status)) {
    return jsonResponse({ error: 'Estado inválido' }, 400, corsHeaders);
  }
  if (tx.status !== 'pendiente') {
    return jsonResponse({ error: 'Solo se pueden modificar compras pendientes' }, 400, corsHeaders);
  }

  try {
    const now = new Date().toISOString();

    if (body.status === 'cancelado') {
      // Restaurar stock al listing y al producto de inventario
      const listing = await env.MIRAI_AI_DB.prepare(
        'SELECT id, product_id, quantity, status FROM sale_listings WHERE id = ?'
      ).bind(tx.listing_id).first();

      const statements = [];

      if (listing) {
        const restoredQty = listing.quantity + tx.quantity;
        // Se reactivaba el listing incondicionalmente: si el vendedor lo había
        // retirado a mano, cancelar una compra se lo volvía a publicar. Solo se
        // reactiva lo que estaba 'agotado' por esta misma venta.
        const restoredStatus = listing.status === 'agotado' ? 'active' : listing.status;

        statements.push(env.MIRAI_AI_DB.prepare(
          `UPDATE sale_listings SET quantity = ?, status = ?, updated_at = ? WHERE id = ?`
        ).bind(restoredQty, restoredStatus, now, listing.id));

        statements.push(env.MIRAI_AI_DB.prepare(
          `UPDATE inventory_products SET quantity = quantity + ?, updated_at = ? WHERE id = ? AND user_dni = ?`
        ).bind(tx.quantity, now, listing.product_id, userDni.toUpperCase()));
      }

      statements.push(env.MIRAI_AI_DB.prepare(
        `UPDATE sale_transactions SET status = 'cancelado' WHERE id = ? AND user_dni = ?`
      ).bind(txId, userDni.toUpperCase()));

      // En un único batch: cancelar y devolver el stock no pueden quedar a medias.
      await env.MIRAI_AI_DB.batch(statements);
    } else {
      await env.MIRAI_AI_DB.prepare(
        `UPDATE sale_transactions SET status = ?, paid_at = ? WHERE id = ? AND user_dni = ?`
      ).bind(body.status, body.status === 'pagado' ? now : null, txId, userDni.toUpperCase()).run();
    }

    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (error) {
    console.error('[Sales] Error al actualizar transacción:', error);
    return jsonResponse({ error: 'Error al actualizar la compra', details: error.message }, 500, corsHeaders);
  }
}
