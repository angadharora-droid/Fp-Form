/**
 * Renders a booking document to a PDF Buffer, mirroring the A4 print layout
 * used by the frontend (frontend/app.js → printBooking).
 *
 * Uses pdfkit (pure JS, no headless browser needed).
 */

const PDFDocument = require('pdfkit');

// Section → list of [label, fieldKey] rows, matching the on-screen detail view.
const SECTIONS = [
  ['Function Prospectus', [
    ['Series No', 'series_no'], ['Reservation No', 'reservation_no'],
    ['Date', 'date'],
    ['Type of Function', 'function_type'], ['Venue', 'venue'], ['MG', 'mg'],
    ['Expected Pax', 'expected_pax'], ['Time Slot', 'time_slot'], ['Menu', 'menu'],
  ]],
  ['Party Details', [
    ['Name of Party', 'party_name'], ['Company Name', 'company_name'],
    ['GST No', 'gst_no'], ['PAN No', 'pan_no'], ['Address', 'address'],
    ['Contact Person', 'contact_person'], ['Telephone / Mobile', 'telephone'],
    ['Email', 'email'], ['Seating Arrangement', 'seating_arrangement'],
    ['Add on Rooms', 'add_on_rooms'],
  ]],
  ['Billing', [
    ['Rate', 'rate'], ['Hall Rent', 'hall_rent'], ['Mode of Payment', 'mode_of_payment'],
    ['Advance Amt', 'advance_amt'], ['Transaction Details', 'transaction_details'],
  ]],
  ['Additional Services', [
    ['Board to Read', 'board_to_read'], ['Other Charges', 'other_charges'],
    ['Details / Amount', 'details_amount'],
  ]],
  ['Instructions', [
    ['Billing Instruction', 'billing_instruction'], ['Housekeeping', 'housekeeping'],
    ['F&B', 'fnb'], ['Kitchen', 'kitchen'],
  ]],
];

function val(v) {
  const s = v == null ? '' : String(v).trim();
  return s || '—';
}

/**
 * @param {object} b  a booking (plain object, e.g. Booking.toJSON()).
 * @returns {Promise<Buffer>}
 */
function renderBookingPdf(b) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const series = b.series_no || String(b.id ?? b.seq ?? '').padStart(3, '0');
    const stamp = b.created_at ? new Date(b.created_at).toLocaleString() : '';
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    // --- Header --------------------------------------------------------------
    doc.fillColor('#111').font('Helvetica-Bold').fontSize(18)
      .text('Centre Point Amravti', left, doc.y, { continued: false });
    doc.font('Helvetica').fontSize(10).fillColor('#333')
      .text('Function Booking Form');

    const metaLines = [
      `Booking No ${series}`,
      b.reservation_no ? `Res. No: ${b.reservation_no}` : null,
      `Submitted by: ${val(b.submitted_by)}`,
      stamp ? `Timestamp: ${stamp}` : null,
    ].filter(Boolean);
    doc.fontSize(9).fillColor('#555')
      .text(metaLines.join('\n'), left, doc.page.margins.top, {
        width,
        align: 'right',
      });

    doc.moveDown(0.5);
    const lineY = doc.y + 2;
    doc.moveTo(left, lineY).lineTo(right, lineY).lineWidth(1.5).strokeColor('#111').stroke();
    doc.moveDown(0.8);

    // --- Sections ------------------------------------------------------------
    // Two-column grid: labels/values are laid out in two side-by-side columns so
    // the whole form fits on a single A4 page (no addPage anywhere below).
    const colGap = 18;
    const colW = (width - colGap) / 2;
    const labelW = colW * 0.4;
    const valueW = colW - labelW - 6;
    const colX = [left, left + colW + colGap];

    const cellHeight = (label, text) => {
      doc.font('Helvetica-Bold').fontSize(8.5);
      const lh = doc.heightOfString(label, { width: labelW });
      doc.font('Helvetica').fontSize(8.5);
      const vh = doc.heightOfString(text, { width: valueW });
      return Math.max(lh, vh);
    };

    const drawCell = (x, y, label, text) => {
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#555')
        .text(label, x, y, { width: labelW });
      doc.font('Helvetica').fontSize(8.5).fillColor('#111')
        .text(text, x + labelW + 6, y, { width: valueW });
    };

    for (const [title, rows] of SECTIONS) {
      // Section heading with a shaded bar.
      const hy = doc.y;
      doc.rect(left, hy, width, 16).fill('#f0f0f0');
      doc.rect(left, hy, 3, 16).fill('#111');
      doc.fillColor('#111').font('Helvetica-Bold').fontSize(9)
        .text(title.toUpperCase(), left + 10, hy + 4, { width: width - 12 });
      doc.y = hy + 19;

      // Walk rows two at a time — one per column, sharing a baseline.
      for (let i = 0; i < rows.length; i += 2) {
        const [lLabel, lKey] = rows[i];
        const lText = val(b[lKey]);
        const rPair = rows[i + 1];
        const rText = rPair ? val(b[rPair[1]]) : '';

        const rowH = Math.max(
          cellHeight(lLabel, lText),
          rPair ? cellHeight(rPair[0], rText) : 0
        ) + 6;

        const y0 = doc.y;
        drawCell(colX[0], y0, lLabel, lText);
        if (rPair) drawCell(colX[1], y0, rPair[0], rText);
        const y1 = y0 + rowH;
        doc.moveTo(left, y1 - 3).lineTo(right, y1 - 3)
          .lineWidth(0.5).strokeColor('#eee').stroke();
        doc.y = y1;
      }
      doc.moveDown(0.4);
    }

    doc.end();
  });
}

module.exports = { renderBookingPdf };
