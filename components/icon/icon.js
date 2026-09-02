// components/icon/icon.js
// iOS 风格图标组件（SF Symbols 设计语言）
//
// 渲染：SVG data-URI + 原生 <image>（微信小程序全平台可靠；内联 <svg>/CSS mask 在部分环境失效）
//
// 数据结构：每个图标 { o, f? }
//   o = outline 内部 SVG（svg 级 stroke=主色, fill=none, round 端点）；多层结构图标在次要 path 上加
//       stroke-opacity 实现 hierarchical（同色多层级透明度，模拟 SF 层级渲染）
//   f = fill 内部 SVG（自包含 fill/stroke 属性；用 __C__ 占位主色，徽标字形用 #FFFFFF）；缺省时回退到 o
//
// 能力：outline（默认）/ fill（选中态、磁贴）/ hierarchical（同色分层）/ 光学描边（按 size 自适应 weight）

const ICONS = {
  /* ===== 导航 / 品牌 ===== */
  house: {
    o: '<path d="M3.5 11.5L12 4l8.5 7.5"/><path d="M6 10v10h4v-6h4v6h4V10"/>',
    f: '<path fill="__C__" fill-rule="evenodd" d="M12 3.2L20.8 11.4H18.8V20H14.4V14H9.6V20H5.2V11.4H3.2zM9.6 14h4.8v6H9.6z"/>'
  },
  'doc-plaintext': {
    o: '<path d="M14.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z"/><path d="M14.5 3v5.5H19"/><path d="M9 13h6M9 16.5h6M9 9.5h3"/>',
    f: '<path fill="__C__" fill-rule="evenodd" d="M7 3h7.5L19 7.5V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 12.3h6v1.7H9zM9 15.8h6v1.7H9zM9 8.8h3.2v1.7H9z"/>'
  },
  person: {
    o: '<circle cx="12" cy="8" r="4.2"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    f: '<circle fill="__C__" cx="12" cy="8" r="4.3"/><path fill="__C__" d="M4.8 20.5a7.2 7.2 0 0 1 14.4 0z"/>'
  },

  /* ===== 服务类型 ===== */
  shippingbox: {
    o: '<path d="M12 2.6L20.5 7.1V16.9L12 21.4 3.5 16.9V7.1z"/><path d="M3.5 7.1L12 11.6l8.5-4.5"/><path d="M12 11.6v9.8"/>',
    f: '<path fill="__C__" d="M12 2.6L20.5 7.1L12 11.6L3.5 7.1z"/><path fill="__C__" fill-opacity="0.8" d="M20.5 7.1L12 11.6L12 21.4L20.5 16.9z"/><path fill="__C__" fill-opacity="0.6" d="M3.5 7.1L12 11.6L12 21.4L3.5 16.9z"/>'
  },
  printer: {
    o: '<path d="M6 9V3.5h12V9"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 17v3.5h10V17" stroke-opacity="0.55"/><path d="M8.5 13h7" stroke-opacity="0.55"/>',
    f: '<path fill="__C__" d="M6 3.5h12V9H6z"/><rect fill="__C__" x="4" y="9" width="16" height="8" rx="2"/><path fill="__C__" fill-opacity="0.5" d="M7 17h10v3.5H7z"/>'
  },
  takeoutbag: {
    o: '<path d="M5.5 8h13l-1 12.5a1.5 1.5 0 0 1-1.5 1.4H8a1.5 1.5 0 0 1-1.5-1.4z"/><path d="M8.5 8V5.5a3.5 3.5 0 0 1 7 0V8" stroke-opacity="0.6"/><path d="M5.5 11.5h13" stroke-opacity="0.45"/>',
    f: '<path fill="__C__" fill-rule="evenodd" d="M5.5 8h13l-1 12.5a1.5 1.5 0 0 1-1.5 1.4H8a1.5 1.5 0 0 1-1.5-1.4zM8.6 8V5.5a3.4 3.4 0 0 1 6.8 0V8h-2V5.6a1.4 1.4 0 0 0-2.8 0V8z"/>'
  },
  'fork-knife': {
    o: '<path d="M6 3v4a2 2 0 0 0 4 0V3"/><path d="M8 7v14"/><path d="M16 3c-1.8 0-2.8 2-2.8 4.5S14.2 12 16 12v9"/>',
    f: '<path fill="__C__" d="M6 3v4a2 2 0 0 0 4 0V3z"/><rect fill="__C__" x="7.4" y="7" width="1.2" height="14"/><path fill="__C__" d="M16 3c-1.8 0-2.8 2-2.8 4.5S14.2 12 16 12v9h-1.2V3z"/>'
  },
  bicycle: {
    o: '<circle cx="6" cy="17" r="3.2"/><circle cx="18" cy="17" r="3.2"/><path d="M6 17l3.5-6.5h6L18 17"/><path d="M9.5 10.5l-1.2-3h-2"/><path d="M14 11l3 6"/>',
    // 复杂开放式形态难做纯实心 fill，用加粗描边表达“选中/强调”态
    f: '<g stroke="__C__" stroke-width="2.7" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="17" r="3.2"/><circle cx="18" cy="17" r="3.2"/><path d="M6 17l3.5-6.5h6L18 17"/><path d="M9.5 10.5l-1.2-3h-2"/><path d="M14 11l3 6"/></g>'
  },

  /* ===== 状态 / 徽标 ===== */
  clock: {
    o: '<circle cx="12" cy="12" r="8.5"/><path d="M12 12V7.5M12 12l3.2 1.8"/>',
    // clock.fill 在 SF 中即为实心圆盘（无指针），靠标签传达语义
    f: '<circle fill="__C__" cx="12" cy="12" r="10.5"/><path d="M12 12V7.5M12 12l3.2 1.8" stroke="#FFFFFF" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
  },
  'checkmark-circle': {
    o: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.2l2.4 2.4 4.6-5.2"/>',
    f: '<circle fill="__C__" cx="12" cy="12" r="10.5"/><path d="M8 12.2l2.6 2.6 5-5.6" stroke="#FFFFFF" stroke-width="2.4" fill="none"/>'
  },
  'checkmark-seal': {
    o: '<path d="M12 2.5l1.8 1.3 2.2-.4 1 2 2 1-.4 2.2 1.3 1.8-1.3 1.8.4 2.2-2 1-1 2-2.2-.4L12 21.5l-1.8-1.3-2.2.4-1-2-2-1 .4-2.2L4.1 12l1.3-1.8-.4-2.2 2-1 1-2 2.2.4z"/><path d="M9 12l2 2 4-4.5"/>',
    f: '<path fill="__C__" d="M12 2.5l1.8 1.3 2.2-.4 1 2 2 1-.4 2.2 1.3 1.8-1.3 1.8.4 2.2-2 1-1 2-2.2-.4L12 21.5l-1.8-1.3-2.2.4-1-2-2-1 .4-2.2L4.1 12l1.3-1.8-.4-2.2 2-1 1-2 2.2.4z"/><path d="M9 12l2 2 4-4.5" stroke="#FFFFFF" stroke-width="2.2" fill="none"/>'
  },
  'xmark-circle': {
    o: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/>',
    f: '<circle fill="__C__" cx="12" cy="12" r="10.5"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5" stroke="#FFFFFF" stroke-width="2.4" fill="none"/>'
  },
  'exclamationmark-circle': {
    o: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5"/><path d="M12 16h.01"/>',
    f: '<circle fill="__C__" cx="12" cy="12" r="10.5"/><path d="M12 7.5v5" stroke="#FFFFFF" stroke-width="2.2" fill="none"/><circle fill="#FFFFFF" cx="12" cy="16" r="1.2"/>'
  },

  /* ===== 联系 / 设置 ===== */
  phone: {
    o: '<path d="M5 4h3l1.5 4-2 1.5a12 12 0 0 0 5 5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    f: '<path fill="__C__" d="M5 4h3l1.5 4-2 1.5a12 12 0 0 0 5 5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'
  },
  bubble: {
    o: '<path d="M4 8.5A4.5 4.5 0 0 1 8.5 4h7A4.5 4.5 0 0 1 20 8.5v4A4.5 4.5 0 0 1 15.5 17H11l-4 3v-3h-.5A4.5 4.5 0 0 1 4 12.5z"/><path d="M8 10.5h8M8 13.5h4" stroke-opacity="0.55"/>',
    f: '<path fill="__C__" fill-rule="evenodd" d="M4 8.5A4.5 4.5 0 0 1 8.5 4h7A4.5 4.5 0 0 1 20 8.5v4A4.5 4.5 0 0 1 15.5 17H11l-4 3v-3h-.5A4.5 4.5 0 0 1 4 12.5zM8 9.8h8v1.7H8zM8 12.8h4v1.7H8z"/>'
  },
  gear: {
    o: '<path d="M22.2 12L19.95 8.71L19.21 4.79L15.29 4.05L12 1.8L8.71 4.05L4.79 4.79L4.05 8.71L1.8 12L4.05 15.29L4.79 19.21L8.71 19.95L12 22.2L15.29 19.95L19.21 19.21L19.95 15.29z"/><circle cx="12" cy="12" r="3"/>',
    f: '<path fill="__C__" fill-rule="evenodd" d="M22.2 12L19.95 8.71L19.21 4.79L15.29 4.05L12 1.8L8.71 4.05L4.79 4.79L4.05 8.71L1.8 12L4.05 15.29L4.79 19.21L8.71 19.95L12 22.2L15.29 19.95L19.21 19.21L19.95 15.29zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>'
  },
  'arrow-right-from-bracket': {
    o: '<path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/><path d="M16 12H8"/><path d="M13 8l3 4-3 4"/>',
    f: '<path fill="__C__" d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4z"/><rect fill="__C__" x="7.5" y="11.2" width="8.5" height="1.6"/><path fill="__C__" d="M12.5 7.8l4 4.2-4 4.2z"/>'
  },
  mappin: {
    o: '<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    f: '<path fill="__C__" fill-rule="evenodd" d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>'
  },
  wallet: {
    o: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18" stroke-opacity="0.55"/><circle cx="17" cy="14.5" r="1.4" stroke-opacity="0.7"/>',
    f: '<rect fill="__C__" x="3" y="6" width="18" height="13" rx="2.5"/><path fill="#FFFFFF" fill-opacity="0.4" d="M3 9.4h18v1.3H3z"/><circle fill="#FFFFFF" fill-opacity="0.75" cx="17" cy="14.5" r="1.5"/>'
  },

  /* ===== 文档 ===== */
  'doc-text': {
    o: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6M9 9.5h3"/>',
    f: '<path fill="__C__" fill-rule="evenodd" d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 12.5h6v1.6H9zM9 16h6v1.6H9zM9 9h3v1.6H9z"/>'
  },
  'doc-on-doc': {
    o: '<path d="M9 7V6a2 2 0 0 1 2-2h5l4 4v8a2 2 0 0 1-2 2h-1" stroke-opacity="0.5"/><rect x="3.5" y="7" width="12" height="13" rx="2"/><path d="M10 12h4M10 15.5h4" stroke-opacity="0.55"/>',
    f: '<path fill="__C__" fill-opacity="0.5" d="M9 7V6a2 2 0 0 1 2-2h5l4 4v8a2 2 0 0 1-2 2h-2V9l-5-5h-2v3z"/><rect fill="__C__" x="3.5" y="7" width="12" height="13" rx="2"/><path fill="#FFFFFF" fill-opacity="0.45" d="M10 11.8h4v1.4h-4zM10 14.8h4v1.4h-4z"/>'
  },

  /* ===== 地址 / 建筑 ===== */
  'building-columns': {
    o: '<path d="M3 9.5L12 4l9 5.5"/><path d="M4 9.5h16"/><path d="M5.5 9.5v9M9.5 9.5v9M14.5 9.5v9M18.5 9.5v9" stroke-opacity="0.6"/><path d="M3.5 19.5h17"/><path d="M3 21.5h18"/>',
    f: '<path fill="__C__" d="M3 9.5L12 4l9 5.5z"/><rect fill="__C__" x="3.2" y="9" width="17.6" height="1.4"/><path fill="__C__" fill-opacity="0.55" d="M5.2 10.4h1.6v8.4h-1.6zM9.2 10.4h1.6v8.4h-1.6zM13.2 10.4h1.6v8.4h-1.6zM17.2 10.4h1.6v8.4h-1.6z"/><rect fill="__C__" x="3" y="18.8" width="18" height="1.4"/><rect fill="__C__" x="2.4" y="20.8" width="19.2" height="1.4"/>'
  },
  'house-door': {
    o: '<path d="M3.5 11.5L12 4l8.5 7.5"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
    f: '<path fill="__C__" fill-rule="evenodd" d="M12 3.2L20.8 11.4H18.8V20H14.4V15H9.6V20H5.2V11.4H3.2zM10.2 15h3.6v5h-3.6z"/>'
  },
  cube: {
    o: '<path d="M12 2.5l8 4.5v9l-8 4.5-8-4.5v-9z"/><path d="M4 7l8 4.5L20 7"/>',
    f: '<path fill="__C__" d="M12 2.5l8 4.5v9l-8 4.5-8-4.5v-9z"/>'
  },
  banknote: {
    o: '<rect x="2.5" y="6.5" width="19" height="11" rx="2"/><circle cx="8" cy="12" r="2.2" stroke-opacity="0.6"/><circle cx="16" cy="12" r="2.2" stroke-opacity="0.6"/>'
  },

  /* ===== 纯字形 / 杂项 ===== */
  plus: { o: '<path d="M12 5v14M5 12h14"/>' },
  checkmark: { o: '<path d="M4 12.5l5 5 11-11"/>' },
  xmark: { o: '<path d="M7 7l10 10M17 7L7 17"/>' },
  'chevron-right': { o: '<path d="M9.5 6l6 6-6 6"/>' },
  minus: { o: '<path d="M5 12h14"/>' },
  trash: {
    o: '<path d="M4 6.5h16"/><path d="M9 6.5V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.5"/><path d="M6.5 6.5l.8 12.5a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12.5"/><path d="M10 10.5v6.5M14 10.5v6.5" stroke-opacity="0.55"/>'
  },
  pencil: {
    o: '<path d="M15 4l5 5-11 11H4v-5z"/><path d="M13 6l5 5"/>'
  },
  location: {
    o: '<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'
  },
  magnifyingglass: {
    o: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/>'
  },
  bell: {
    o: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7z"/><path d="M10 20a2 2 0 0 0 4 0"/>'
  }
};

// CSS 变量 / currentColor 映射为具体色值（<image> 无法解析 CSS 变量）
const COLOR_MAP = {
  'var(--primary-color)': '#007AFF',
  'var(--primary-active)': '#0062CC',
  'var(--success-color)': '#34C759',
  'var(--warning-color)': '#FF9500',
  'var(--danger-color)': '#FF3B30',
  'var(--purple-color)': '#AF52DE',
  'var(--text-primary)': '#1C1C1E',
  'var(--text-secondary)': '#8E8E93',
  'var(--text-tertiary)': '#C7C7CC',
  'var(--text-inverse)': '#FFFFFF',
  currentColor: '#1C1C1E'
};

function resolveColor(color) {
  if (!color) return '#1C1C1E';
  return COLOR_MAP[color] || color;
}

// 光学描边：weight 为 0/空时按 size 自适应（小尺寸略粗、大尺寸略细），模拟 SF 光学尺寸
function resolveWeight(weight, size) {
  if (weight === 0 || weight === '0' || weight === undefined || weight === null || weight === '') {
    const s = parseFloat(size);
    if (isNaN(s) || s <= 30) return 2.0;
    if (s <= 50) return 1.85;
    return 1.7;
  }
  return Number(weight) || 2;
}

// 纯 JS base64 编码（小程序无 btoa）。SVG 内容均为 ASCII，安全。
function toBase64(str) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  while (i < str.length) {
    const a = str.charCodeAt(i++);
    const b = i < str.length ? str.charCodeAt(i++) : NaN;
    const c = i < str.length ? str.charCodeAt(i++) : NaN;
    const bitmap = (a << 16) | ((isNaN(b) ? 0 : b) << 8) | (isNaN(c) ? 0 : c);
    result += chars.charAt((bitmap >> 18) & 63);
    result += chars.charAt((bitmap >> 12) & 63);
    result += isNaN(b) ? '=' : chars.charAt((bitmap >> 6) & 63);
    result += isNaN(c) ? '=' : chars.charAt(bitmap & 63);
  }
  return result;
}

function buildSrc(name, color, weight, fill, size) {
  const entry = ICONS[name];
  if (!entry) return '';
  const c = resolveColor(color);
  const useFill = !!fill && !!entry.f;
  const inner = useFill ? entry.f.replace(/__C__/g, c) : entry.o;
  const caps = ' stroke-linecap="round" stroke-linejoin="round"';
  const common = 'xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"';
  let svg;
  if (useFill) {
    // fill 内部已自包含 fill/stroke；svg 级仅设端点圆角
    svg = '<svg ' + common + ' fill="none" stroke="none"' + caps + '>' + inner + '</svg>';
  } else {
    const w = resolveWeight(weight, size);
    svg = '<svg ' + common + ' fill="none" stroke="' + c + '" stroke-width="' + w + '"' + caps + '>' + inner + '</svg>';
  }
  return 'data:image/svg+xml;base64,' + toBase64(svg);
}

Component({
  properties: {
    name: { type: String, value: '' },
    size: { type: Number, optionalTypes: [String], value: 32 },
    color: { type: String, value: 'currentColor' },
    weight: { type: Number, optionalTypes: [String], value: 0 }, // 0 = 按尺寸光学自适应
    fill: { type: Boolean, value: false }
  },
  data: {
    _src: ''
  },
  observers: {
    'name, color, weight, fill, size': function (name, color, weight, fill, size) {
      this.setData({ _src: buildSrc(name, color, weight, fill, size) });
    }
  },
  lifetimes: {
    attached() {
      this.setData({ _src: buildSrc(this.data.name, this.data.color, this.data.weight, this.data.fill, this.data.size) });
    }
  }
});
