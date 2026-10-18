/** Synthetic warehouse receipts (pledge collateral). */

import { r } from './types.js';
import type { Sample } from './types.js';

export function warehouseReceipt(id: string, depositor: string, qty: string, date: string): Sample {
  return {
    id,
    title: `Warehouse receipt WR-PN-0457 — ${depositor}`,
    docType: 'warehouse_receipt',
    language: 'mixed',
    rects: [{ x: 30, y: 120, w: 540, h: 360 }],
    lines: [
      {
        x: 300,
        y: 70,
        text: 'गोदाम पावती / Warehouse Receipt',
        size: 19,
        weight: 700,
        anchor: 'middle',
      },
      {
        x: 300,
        y: 96,
        text: 'Shirur Krushi Godown (synthetic)',
        size: 13,
        anchor: 'middle',
        muted: true,
      },
      { x: 50, y: 165, text: 'Receipt No. / पावती क्र. : WR-PN-0457', size: 15, weight: 600 },
      { x: 50, y: 210, text: `Depositor / ठेवीदार : ${depositor}`, size: 15 },
      { x: 50, y: 255, text: 'Commodity / माल : Soybean (सोयाबीन)', size: 15 },
      { x: 50, y: 300, text: `Quantity / परिमाण : ${qty}`, size: 15 },
      { x: 50, y: 345, text: `Date / दिनांक : ${date}`, size: 15 },
      {
        x: 300,
        y: 760,
        text: 'SYNTHETIC SAMPLE — fictional receipt',
        size: 12,
        anchor: 'middle',
        muted: true,
      },
    ],
    fields: [
      {
        key: 'receipt_number',
        label: 'Warehouse receipt number',
        value: 'WR-PN-0457',
        region: r(46, 146, 330, 26),
        quality: 'clear',
      },
      {
        key: 'depositor_name',
        label: 'Depositor',
        value: depositor,
        region: r(46, 191, 380, 26),
        quality: 'clear',
      },
      {
        key: 'commodity',
        label: 'Commodity',
        value: 'Soybean (सोयाबीन)',
        region: r(46, 236, 330, 26),
        quality: 'clear',
      },
      {
        key: 'quantity',
        label: 'Quantity',
        value: qty,
        region: r(46, 281, 300, 26),
        quality: 'clear',
      },
      {
        key: 'document_date',
        label: 'Document date',
        value: date,
        region: r(46, 326, 260, 26),
        quality: 'clear',
      },
    ],
    originalText: `गोदाम पावती / Warehouse Receipt\nReceipt No.: WR-PN-0457\nDepositor: ${depositor}\nCommodity: Soybean (सोयाबीन)\nQuantity: ${qty}\nDate: ${date}`,
    transliteration: null,
    translation: `Warehouse receipt WR-PN-0457, depositor ${depositor}, soybean, ${qty}, dated ${date}.`,
    qualityWarnings: [],
  };
}
