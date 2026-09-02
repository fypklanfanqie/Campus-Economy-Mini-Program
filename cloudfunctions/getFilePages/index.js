// cloudfunctions/getFilePages/index.js
// 解析上传文件页数：PDF 精确识别，DOCX 读取 Word 统计页数，
// 旧版 .doc 无法可靠解析，交由用户手动填写。

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const PDFLib = require('pdf-lib');
const JSZip = require('jszip');

// 每页约段落数（仅当 DOCX 缺 Pages 统计时用于粗略估算）
const PARAS_PER_PAGE = 40;

exports.main = async (event) => {
  try {
    const { fileID, fileName } = event;
    if (!fileID) {
      return { code: 1001, message: '文件ID缺失' };
    }

    // 下载云存储文件到内存
    const dl = await cloud.downloadFile({ fileID });
    const buffer = dl.fileContent;
    const ext = (fileName || fileID).split('.').pop().toLowerCase();

    // ========== PDF：精确页数 ==========
    if (ext === 'pdf') {
      const pdf = await PDFLib.PDFDocument.load(buffer);
      const pages = pdf.getPageCount();
      return { code: 0, data: { fileType: 'pdf', pages, needsManual: false } };
    }

    // ========== DOCX：读取 docProps/app.xml 中的 Pages 统计 ==========
    if (ext === 'docx') {
      const zip = await JSZip.loadAsync(buffer);
      const appXmlFile = zip.file('docProps/app.xml');
      let pages = 0;

      if (appXmlFile) {
        const txt = await appXmlFile.async('string');
        const m = txt.match(/<Pages>(\d+)<\/Pages>/);
        if (m) pages = parseInt(m[1], 10);
      }

      // 缺 Pages 统计时，按段落数粗略估算并标记需手动确认
      if (!pages) {
        const docXmlFile = zip.file('word/document.xml');
        if (docXmlFile) {
          const txt = await docXmlFile.async('string');
          const paras = (txt.match(/<w:p[ >]/g) || []).length;
          pages = Math.max(1, Math.ceil(paras / PARAS_PER_PAGE));
        }
        return {
          code: 0,
          data: {
            fileType: 'docx',
            pages,
            needsManual: true,
            message: '未能读取精确页数，已按篇幅估算，请确认'
          }
        };
      }

      return { code: 0, data: { fileType: 'docx', pages, needsManual: false } };
    }

    // ========== DOC：旧版二进制格式，无法可靠解析 ==========
    if (ext === 'doc') {
      return {
        code: 0,
        data: {
          fileType: 'doc',
          pages: 0,
          needsManual: true,
          message: '旧版 .doc 文件无法自动识别页数，请手动填写'
        }
      };
    }

    return { code: 1002, message: '不支持的文件类型，仅支持 doc/docx/pdf' };
  } catch (err) {
    console.error('解析文件页数失败:', err);
    return {
      code: 500,
      message: '文件解析失败，请重试或手动填写页数',
      data: { needsManual: true, pages: 0 }
    };
  }
};
