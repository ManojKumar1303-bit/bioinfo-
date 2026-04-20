import { jsPDF } from 'jspdf';

export const API_BASE_URL = 'http://localhost:5000';

export const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`
});

export const exportSavedResultPDF = (result) => {
  const doc = new jsPDF();
  const safeDate = result?.createdAt ? new Date(result.createdAt).toLocaleString() : 'N/A';
  const typeLabel = String(result?.type || '').toUpperCase();

  doc.setFontSize(18);
  doc.text('BioDash AI Saved Result', 14, 20);

  doc.setFontSize(12);
  doc.text(`Type: ${typeLabel}`, 14, 34);
  doc.text(`Name: ${result?.name || 'Untitled'}`, 14, 42);
  doc.text(`Date: ${safeDate}`, 14, 50);

  doc.setFontSize(13);
  doc.text('AI Explanation:', 14, 62);

  doc.setFontSize(11);
  const wrappedText = doc.splitTextToSize(String(result?.content || ''), 180);
  doc.text(wrappedText, 14, 70);

  const fileName = `saved-${result?.type || 'result'}-${String(result?.name || 'export').replace(/\s+/g, '-').toLowerCase()}.pdf`;
  doc.save(fileName);
};
