// โครงสร้างสมุดแต่ละประเภท (ใช้ร่วมกันทั้งฝั่งเซิร์ฟเวอร์และเบราว์เซอร์)
// อ้างอิงแบบทะเบียนหนังสือรับ / ทะเบียนหนังสือส่ง ตามระเบียบสำนักนายกรัฐมนตรีว่าด้วยงานสารบรรณ
// และสมุดคุมเลขรับคำร้องทั่วไป

export const BOOK_TYPES = {
  receive: {
    label: 'ทะเบียนหนังสือรับ',
    short: 'เลขรับ',
    noLabel: 'เลขทะเบียนรับ',
    dateLabel: 'วันที่รับ',
    icon: 'inbox',
    canSign: true,
    fields: [
      { key: 'doc_ref', label: 'ที่', placeholder: 'เลขที่หนังสือของผู้ส่ง เช่น ศธ ๐๔๐๐๑/ว๑๒๓' },
      { key: 'doc_date', label: 'ลงวันที่', type: 'date' },
      { key: 'sender', label: 'จาก', placeholder: 'หน่วยงาน/ผู้ส่ง' },
      { key: 'recipient', label: 'ถึง', placeholder: 'ผู้รับ/ตำแหน่ง' },
      { key: 'subject', label: 'เรื่อง', required: true, wide: true },
      { key: 'action', label: 'การปฏิบัติ', placeholder: 'เช่น เสนอ ผอ. / มอบงานบุคคล', wide: true },
      { key: 'note', label: 'หมายเหตุ', wide: true },
    ],
    columns: ['no', 'entry_date', 'doc_ref', 'doc_date', 'sender', 'recipient', 'subject', 'action', 'note'],
  },
  send: {
    label: 'ทะเบียนหนังสือส่ง',
    short: 'เลขส่ง',
    noLabel: 'เลขทะเบียนส่ง',
    dateLabel: 'ลงวันที่',
    icon: 'send',
    canSign: false,
    fields: [
      { key: 'sender', label: 'จาก', placeholder: 'ผู้ลงนาม/หน่วยงานเจ้าของเรื่อง' },
      { key: 'recipient', label: 'ถึง', placeholder: 'หน่วยงาน/ผู้รับ' },
      { key: 'subject', label: 'เรื่อง', required: true, wide: true },
      { key: 'action', label: 'การปฏิบัติ', placeholder: 'เช่น ส่งทางไปรษณีย์ / e-office', wide: true },
      { key: 'note', label: 'หมายเหตุ', wide: true },
    ],
    columns: ['no', 'doc_ref', 'entry_date', 'sender', 'recipient', 'subject', 'action', 'note'],
  },
  petition: {
    label: 'สมุดคุมเลขรับคำร้องทั่วไป',
    short: 'เลขคำร้อง',
    noLabel: 'เลขรับคำร้อง',
    dateLabel: 'วันที่รับ',
    icon: 'petition',
    canSign: false,
    fields: [
      { key: 'petitioner', label: 'ชื่อผู้ยื่นคำร้อง', required: true },
      { key: 'contact', label: 'ที่อยู่ / โทรศัพท์' },
      { key: 'subject', label: 'เรื่อง', required: true, wide: true },
      { key: 'recipient', label: 'ผู้รับเรื่อง / ส่งต่อถึง' },
      { key: 'action', label: 'การดำเนินการ', wide: true },
      { key: 'note', label: 'หมายเหตุ', wide: true },
    ],
    columns: ['no', 'entry_date', 'petitioner', 'contact', 'subject', 'recipient', 'action', 'note'],
  },
};

export const COLUMN_LABELS = {
  doc_ref: 'ที่', doc_date: 'ลงวันที่', sender: 'จาก', recipient: 'ถึง', subject: 'เรื่อง',
  action: 'การปฏิบัติ', note: 'หมายเหตุ', petitioner: 'ผู้ยื่นคำร้อง', contact: 'ที่อยู่/โทร',
};

/** ทุกฟิลด์ข้อมูลที่ผู้ใช้กรอกได้ (whitelist) */
export const ALL_FIELDS = ['doc_ref', 'doc_date', 'sender', 'recipient', 'subject', 'action', 'note', 'petitioner', 'contact'];

export const fieldsOf = (type) => BOOK_TYPES[type]?.fields.map((f) => f.key) || [];

/** เลขที่แสดงผล: ทะเบียนส่ง → "ที่ <prefix><no>", คำร้อง → "<no>/<ปี>" */
export function displayNo(book, no) {
  if (!book) return String(no);
  if (book.type === 'petition') return `${no}/${book.year}`;
  return String(no);
}

export function sendRef(book, no) {
  return `${book.prefix || ''}${no}`;
}

export const STATUS_LABEL = { reserved: 'จองไว้', filled: 'ลงรายละเอียดแล้ว', cancelled: 'ยกเลิก' };
