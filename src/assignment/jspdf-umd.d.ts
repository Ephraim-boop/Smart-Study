declare module 'jspdf/dist/jspdf.umd.min.js' {
  import { jsPDF } from 'jspdf';

  const bundle: { jsPDF: typeof jsPDF };
  export default bundle;
}
