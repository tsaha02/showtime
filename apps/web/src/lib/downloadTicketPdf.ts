import type { RefObject } from "react";

// Renders whatever DOM node the ref points at (the TicketQRCode card) to a
// canvas, then drops that image into a jsPDF page sized to match it — no
// backend involvement, the ticket is already fully rendered client-side.
//
// jsPDF + html2canvas are ~500KB combined and used by exactly one
// action (clicking "Download PDF") that most visitors never trigger —
// dynamically imported here rather than at module load, so Vite splits
// them into their own chunk that only downloads when someone actually
// clicks the button, instead of padding every page's initial load.
export async function downloadTicketPdf(ref: RefObject<HTMLElement>, filename: string) {
  const node = ref.current;
  if (!node) return;

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);

  const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
  const imageData = canvas.toDataURL("image/png");

  const orientation = canvas.width >= canvas.height ? "landscape" : "portrait";
  const doc = new jsPDF({ orientation, unit: "px", format: [canvas.width, canvas.height] });
  doc.addImage(imageData, "PNG", 0, 0, canvas.width, canvas.height);
  doc.save(filename);
}
