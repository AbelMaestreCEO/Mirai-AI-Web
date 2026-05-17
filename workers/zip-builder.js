// src/zip-builder.js

import { zipSync } from 'fflate';

export const createZipArchive = (files, options = {}) => {
  if (!files || !Array.isArray(files) || files.length === 0) {
    throw new Error('No se proporcionaron archivos para comprimir. El ZIP estaría vacío.');
  }

  const compressionLevel = options.level ?? 6;

  // Validar y convertir cada archivo ANTES de pasar a zipSync
  const validFiles = {};
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    if (!file.filename || typeof file.filename !== 'string') {
      throw new Error(`Archivo en índice ${i}: Falta o es inválido el nombre del archivo.`);
    }
    if (!file.data) {
      throw new Error(`Archivo "${file.filename}": Falta el contenido binario (data).`);
    }

    let data = file.data;
    
    // Conversión EXPLÍCITA y SEGURA a Uint8Array
    if (data instanceof Uint8Array) {
      // Ya es el tipo correcto, usar directamente
      validFiles[file.filename] = data;
    } else if (data instanceof ArrayBuffer) {
      // Convertir ArrayBuffer a Uint8Array
      validFiles[file.filename] = new Uint8Array(data);
    } else if (ArrayBuffer.isView(data)) {
      // Otro tipo de vista de buffer
      validFiles[file.filename] = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } else if (typeof data === 'object' && data.byteLength !== undefined) {
      // Intentar convertir cualquier objeto con byteLength
      validFiles[file.filename] = new Uint8Array(data);
    } else {
      throw new Error(`Datos inválidos para "${file.filename}". Tipo: ${typeof data}, Valor: ${JSON.stringify(data).substring(0, 100)}`);
    }
  }

  // DEBUG: Verificar que todos los datos son Uint8Array
  for (const [filename, data] of Object.entries(validFiles)) {
    if (!(data instanceof Uint8Array)) {
      throw new Error(`Error interno: ${filename} no es Uint8Array después de la conversión. Tipo: ${typeof data}`);
    }
    if (data.length === 0) {
      console.warn(`Advertencia: ${filename} tiene 0 bytes`);
    }
  }

  // Llamar a zipSync con datos validados
  try {
    const zipData = zipSync(validFiles, { level: compressionLevel });
    
    if (!(zipData instanceof Uint8Array)) {
      throw new Error('zipSync no devolvió Uint8Array');
    }
    
    return zipData;
  } catch (error) {
    console.error('[ZipBuilder] Error al comprimir archivos:', error);
    console.error('[ZipBuilder] Archivos procesados:', Object.keys(validFiles));
    console.error('[ZipBuilder] Tamanios:', Object.fromEntries(
      Object.entries(validFiles).map(([k, v]) => [k, v.length])
    ));
    throw new Error(`Fallo al generar el archivo ZIP: ${error.message}`);
  }
};

export const generateZipName = (fileCount = 1) => {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `documentos_formateados_${fileCount}_archivos_${timestamp}.zip`;
};

export default {
  createZipArchive,
  generateZipName
};