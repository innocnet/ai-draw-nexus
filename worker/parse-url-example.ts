// 示例代码
import { NextRequest, NextResponse } from 'next/server';
import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
// 临时功能：access token 校验
import { validateAccessToken } from '@/lib/auth/accessToken';

export const runtime = 'edge'
/**
 * 检测是否为微信公众号文章
 */
function isWechatArticle(url: string): boolean {
  return url.includes('mp.weixin.qq.com');
}

/**
 * 针对微信公众号文章的特殊处理
 */
function preprocessWechatArticle(document: Document): void {
  // 微信公众号的内容在 #js_content 中，可能被 CSS 隐藏
  const jsContent = document.getElementById('js_content');
  if (jsContent) {
    // 移除隐藏样式
    jsContent.style.visibility = 'visible';
    jsContent.style.display = 'block';
  }

  // 处理微信的图片：将 data-src 转换为 src
  const images = document.querySelectorAll('img[data-src]');
  images.forEach((img) => {
    const dataSrc = img.getAttribute('data-src');
    if (dataSrc) {
      img.setAttribute('src', dataSrc);
    }
  });

  // 移除微信的一些干扰元素
  const removeSelectors = [
    '#js_pc_qr_code',
    '#js_profile_qrcode',
    '.qr_code_pc_outer',
    '.rich_media_area_extra',
    '.reward_area',
    '#js_tags',
    '.original_area_primary',
    '.original_area_extra',
  ];
  removeSelectors.forEach((selector) => {
    const elements = document.querySelectorAll(selector);
    elements.forEach((el) => el.remove());
  });
}

/**
 * 从微信公众号页面直接提取内容（当 Readability 失败时的备选方案）
 */
function extractWechatContent(document: Document): { title: string; content: string } | null {
  // 获取标题
  const titleEl = document.getElementById('activity-name') ||
                  document.querySelector('.rich_media_title') ||
                  document.querySelector('h1');
  const title = titleEl?.textContent?.trim() || '微信公众号文章';

  // 获取内容
  const contentEl = document.getElementById('js_content') ||
                    document.querySelector('.rich_media_content');

  if (!contentEl) {
    return null;
  }

  // 清理内容
  const content = contentEl.innerHTML;

  return { title, content };
}

/**
 * POST /api/parse-url
 * 解析URL内容并转换为Markdown
 */
export async function POST(request: NextRequest) {
  try {
    // 临时功能：验证 access token
    const tokenError = validateAccessToken(request);
    if (tokenError) return tokenError;

    const { url } = await request.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: '请提供有效的URL' },
        { status: 400 }
      );
    }

    // 验证URL格式
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { error: 'URL格式无效' },
        { status: 400 }
      );
    }

    const isWechat = isWechatArticle(url);

    // 构建请求头
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    };

    // 微信公众号需要特殊的 Referer
    if (isWechat) {
      headers['Referer'] = 'https://mp.weixin.qq.com/';
    }

    // 获取网页内容
    const response = await fetch(url, {
      headers,
      redirect: 'follow',
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `无法获取页面内容: ${response.status} ${response.statusText}` },
        { status: 502 }
      );
    }

    const html = await response.text();

    // 使用 linkedom 解析 HTML
    const { document } = parseHTML(html);

    // 微信公众号特殊预处理
    if (isWechat) {
      preprocessWechatArticle(document);
    }

    // 尝试使用 Readability 提取文章内容
    const reader = new Readability(document.cloneNode(true) as Document);
    let article = reader.parse();

    // 如果 Readability 失败且是微信文章，使用备选方案
    if (!article && isWechat) {
      const wechatContent = extractWechatContent(document);
      if (wechatContent) {
        article = {
          title: wechatContent.title,
          content: wechatContent.content,
          textContent: '',
          length: wechatContent.content.length,
          excerpt: '',
          byline: '',
          dir: '',
          siteName: '微信公众号',
          lang: 'zh-CN',
          publishedTime: null,
        };
      }
    }

    if (!article) {
      return NextResponse.json(
        { error: '无法解析页面内容，该页面可能不是文章类型' },
        { status: 422 }
      );
    }

    // 使用Turndown将HTML转换为Markdown
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });

    // 添加自定义规则：移除空链接
    turndownService.addRule('removeEmptyLinks', {
      filter: (node) => {
        return node.nodeName === 'A' && !node.textContent?.trim();
      },
      replacement: () => '',
    });

    // 添加自定义规则：处理微信的图片（保留 data-src）
    turndownService.addRule('wechatImages', {
      filter: (node) => {
        return node.nodeName === 'IMG';
      },
      replacement: (_content, node) => {
        const img = node as HTMLImageElement;
        const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
        const alt = img.getAttribute('alt') || '';
        if (!src) return '';
        return `![${alt}](${src})`;
      },
    });

    // 添加自定义规则：处理微信的 section 标签（当作 div 处理）
    turndownService.addRule('sections', {
      filter: 'section',
      replacement: (content) => content + '\n\n',
    });

    // 使用 linkedom 解析文章内容为 DOM 元素
    // 注意：TurndownService 在 Edge Runtime 中无法直接解析 HTML 字符串
    // 因为它内部需要使用 document.implementation.createHTMLDocument()
    // 所以需要先用 linkedom 解析，再传入 DOM 元素
    // 重要：parseHTML 需要完整的 HTML 文档结构，article.content 只是片段
    const wrappedHtml = `<!DOCTYPE html><html><body>${article.content || ''}</body></html>`;
    const { document: contentDoc } = parseHTML(wrappedHtml);
    const markdown = turndownService.turndown(contentDoc.body);

    // 构建完整的Markdown内容，包含标题和来源
    const siteName = isWechat ? '微信公众号' : parsedUrl.hostname;
    const fullMarkdown = `# ${article.title}\n\n> 来源: [${siteName}](${url})\n\n${markdown}`;

    return NextResponse.json({
      success: true,
      data: {
        title: article.title,
        content: fullMarkdown,
        excerpt: article.excerpt,
        byline: article.byline,
        siteName: article.siteName || siteName,
        url: url,
      },
    });
  } catch (error) {
    console.error('Parse URL error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '解析失败' },
      { status: 500 }
    );
  }
}
