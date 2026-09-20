import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import type { RefObject } from "react";

// Renders whatever DOM node the ref points at (the TicketQRCode card) to a
// canvas, then drops that image into a jsPDF page sized to match it — no
// backend involvement, the ticket is already fully rendered client-side.
export async function downloadTicketPdf(ref: RefObject<HTMLElement>, filename: string) {
  const node = ref.current;
  if (!node) return;

  const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
  const imageData = canvas.toDataURL("image/png");

  const orientation = canvas.width >= canvas.height ? "landscape" : "portrait";
  const doc = new jsPDF({ orientation, unit: "px", format: [canvas.width, canvas.height] });
  doc.addImage(imageData, "PNG", 0, 0, canvas.width, canvas.height);
  doc.save(filename);
}
