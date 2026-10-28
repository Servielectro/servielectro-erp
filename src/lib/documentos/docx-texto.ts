import "server-only";
import { inflateRawSync } from "node:zlib";

/**
 * El texto de un .docx (Word 2007 en adelante): es un ZIP y el texto está en word/document.xml.
 * Sin dependencias: se lee el directorio central del ZIP, se descomprime esa entrada y se le quitan
 * las etiquetas (un párrafo por renglón). Un .doc viejo (binario) no se puede: devuelve null.
 */
export function textoDeDocx(zip: Buffer): string | null {
  // Fin del directorio central: firma 0x06054b50, buscando desde el final (hay un comentario opcional).
  let fin = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) return null;
  const entradas = zip.readUInt16LE(fin + 10);
  let p = zip.readUInt32LE(fin + 16);
  for (let n = 0; n < entradas; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) return null;
    const metodo = zip.readUInt16LE(p + 10);
    const comprimido = zip.readUInt32LE(p + 20);
    const largoNombre = zip.readUInt16LE(p + 28);
    const largoExtra = zip.readUInt16LE(p + 30);
    const largoComentario = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const nombre = zip.toString("utf8", p + 46, p + 46 + largoNombre);
    if (nombre === "word/document.xml") {
      const inicio = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const datos = zip.subarray(inicio, inicio + comprimido);
      const xml = (metodo === 0 ? datos : inflateRawSync(datos)).toString("utf8");
      return xml
        .replace(/<w:tab\/>/g, "\t")
        .replace(/<w:br[^>]*\/>/g, "\n")
        .replace(/<\/w:p>/g, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return null;
}
