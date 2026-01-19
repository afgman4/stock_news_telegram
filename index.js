const TelegramBot = require('node-telegram-bot-api');
const axios = require("axios");
const cheerio = require("cheerio");
const moment = require('moment');

const token = '';
const bot = new TelegramBot(token, { polling: true });

let check = false;
let playAlert = null;
let compare_map = new Map();
let currentKwdIndex = 0;

let myKeywords = [
    '바이젠셀', '젠큐릭스', '큐라클', '압타바이오', '퓨쳐켐', '메지온', '지아이이노베이션',
    '에이프릴바이오', '큐리언트', '티움바이오', '엔케이맥스', '파멥신', '앱클론', '오스코텍',
    '박셀바이오', '지씨셀', '셀리드', '헬릭스미스', '제넥신', '유틸렉스', '고바이오랩',
    '올리패스', '올릭스', '코오롱티슈진', '디앤디파마텍', '넥스트바이오메디컬', '보로노이',
    '샤페론', '브릿지바이오테라퓨틱스', '에스씨엠생명과학', '카이노스메드', '이수앱지스',
    '안트로젠', '아이진', '펩트론', '인벤티지랩'
];

let filterKeywords = ['승인', '허가', '특허','획득', 'FDA', 'NDA', '샌드박스', 'CSR', '결과보고서', '성공', 'L/O', '계약', '공시'];

class BaseScraper {
    constructor(keyword) {
        this.keyword = keyword;
        this.encodedKeyword = encodeURIComponent(keyword);
    }

    async fetch(url) {
        try {
            const res = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
                },
                timeout: 5000
            });
            return res?.data ? cheerio.load(res.data) : null;
        } catch (e) {
            console.warn(`[fetch 실패] ${url} → ${e.message}`);
            return null;
        }
    }

    makeAbsoluteUrl(href, base) {
        if (!href) return '';
        if (href.startsWith('http')) return href;
        try {
            return new URL(href, base).href;
        } catch {
            return base + href;
        }
    }

    validate(title) {
        if (!title) return false;
        return title.toLowerCase().includes(this.keyword.toLowerCase());
    }

    isToday(dateText) {
        if (!dateText) return false;
        const now = moment();
        const todayStrs = [
            now.format('YYYY.MM.DD'),
            now.format('YYYY-MM-DD'),
            now.format('YYYYMMDD'),
            now.format('MM.DD'),
            now.format('HH시'),
            '시전', '분전', '시간전', '오늘'
        ];
        const clean = dateText.replace(/[^0-9.\-]/g, '').trim();
        return todayStrs.some(s => dateText.includes(s) || clean.includes(s));
    }
}

/* ──────────────────────────────────────────────
   각 언론사 스크래퍼 (2025~2026년 기준 구조 반영 추정)
─────────────────────────────────────────────── */

class TheBio extends BaseScraper {
    async getNewsList() {
        const $ = await this.fetch(`https://www.thebionews.net/news/articleList.html?sc_area=A&view_type=sm&sc_word=${this.encodedKeyword}`);
        if (!$) return [];

        const list = [];
        const base = 'https://www.thebionews.net';

        $('.titles a, .title a, .article-title a, li a').each((i, el) => {
            const $el = $(el);
            const $container = $el.closest('.item, .list-item, li, .article');
            const date = $container.find('.date, .time, .published, small').first().text().trim();

            if (this.isToday(date)) {
                const title = $el.text().trim();
                const href = $el.attr('href');
                const link = this.makeAbsoluteUrl(href, base);
                if (title && link) list.push({ title, link });
            }
        });
        return list;
    }
}

class BioTimes extends BaseScraper {
    async getNewsList() {
        const $ = await this.fetch(`http://www.biotimes.co.kr/news/articleList.html?sc_word=${this.encodedKeyword}`);
        if (!$) return [];

        const list = [];
        const base = 'http://www.biotimes.co.kr';

        $('.list-titles a, .title a, .subject a').each((i, el) => {
            const $el = $(el);
            const $block = $el.closest('.list-block, .item, li');
            const date = $block.find('.list-dated, .date, .regdate').first().text().trim();

            if (this.isToday(date)) {
                const title = $el.text().trim();
                const href = $el.attr('href');
                const link = this.makeAbsoluteUrl(href, base);
                if (title && link) list.push({ title, link });
            }
        });
        return list;
    }
}

class PharmNews extends BaseScraper {
    async getNewsList() {
        const searchUrl = `https://www.pharmnews.com/news/articleList.html?sc_word=${this.encodedKeyword}`;
        const $ = await this.fetch(searchUrl);
        if (!$) {
            console.warn(`[PharmNews] Fetch 실패: ${searchUrl}`);
            return [];
        }

        const list = [];
        const base = 'https://www.pharmnews.com';

        // 주요 리스트: ul.type1 > li
        $('ul.type1 > li').each((i, el) => {
            const $li = $(el);

            // 제목 & 링크
            const $titleLink = $li.find('h4.titles a').first();
            if (!$titleLink.length) return;

            const title = $titleLink.text().trim();
            if (!title) return;

            const href = $titleLink.attr('href');
            if (!href || !href.includes('/articleView.html?idxno=')) return;

            // 날짜: em.info.dated
            const dateText = $li.find('em.info.dated').first().text().trim();
            if (!dateText) return;

            if (this.isToday(dateText)) {
                const link = this.makeAbsoluteUrl(href, base);
                if (title && link) {
                    list.push({ title, link });
                }
            }
        });

        console.log(`[PharmNews] 오늘 발견된 기사: ${list.length}건`);
        return list;
    }
}

class Yakup extends BaseScraper {
    async getNewsList() {
        const $ = await this.fetch(`https://www.yakup.com/search/index.html?csearch_word=${this.encodedKeyword}`);
        if (!$) return [];

        const list = [];
        const base = 'https://www.yakup.com';

        $('ul li a, .news_item a, .list a').each((i, el) => {
            const $el = $(el);
            const $li = $el.closest('li');
            const date = $li.find('.date, .regdate, small, .time').last().text().trim(); // 날짜가 아래쪽에 있는 경우 많음

            if (this.isToday(date)) {
                const title = $el.text().trim();
                const href = $el.attr('href');
                const link = this.makeAbsoluteUrl(href, base);
                if (title && link) list.push({ title, link });
            }
        });
        return list;
    }
}

class DailyPharm extends BaseScraper {
    async getNewsList() {
        const searchUrl = `https://www.dailypharm.com/user/news/search?dropBarMode=search&searchOption=any&searchKeyword=${this.encodedKeyword}`;
        const $ = await this.fetch(searchUrl);
        if (!$) {
            console.warn(`[DailyPharm] Fetch 실패: ${searchUrl}`);
            return [];
        }

        const list = [];
        const base = 'https://www.dailypharm.com';  // 절대 URL이지만 안전하게

        // 주요 리스트 컨테이너
        $('ul.act_list_sty2 > li').each((i, el) => {
            const $li = $(el);

            // 링크 & 제목 요소
            const $link = $li.find('a').first();
            if (!$link.length) return;

            const href = $link.attr('href');
            if (!href || !href.includes('/user/news/')) return;

            // 제목: .lin_title
            const title = $li.find('.lin_title').text().trim();
            if (!title) {
                // fallback: a 태그 안의 텍스트 전체
                const fallbackTitle = $link.text().trim();
                if (fallbackTitle) title = fallbackTitle;
                else return;
            }

            // 요약 텍스트 (필요 시 키워드 추가 검증용)
            const summary = $li.find('.lin_cont').text().trim();

            // 날짜: 목록에 명확한 date 클래스가 없으므로, 
            //   실제로는 본문 페이지에 있지만 여기서는 생략 → 오늘자 가정 + validate/title 필터링에 의존
            //   (더 정확히 하려면 각 href 방문 필요하지만 부하 큼 → 생략 추천)

            // 오늘자 가정 (또는 summary에 날짜 문자열 있으면 체크)
            let isRecent = true;  // 기본 true (최신순 목록이라 상위 아이템 위주)
            const possibleDate = summary.match(/\d{4}-\d{2}-\d{2}/) || title.match(/\d{4}-\d{2}-\d{2}/);
            if (possibleDate) {
                isRecent = this.isToday(possibleDate[0]);
            }

            if (isRecent) {
                const link = href.startsWith('http') ? href : this.makeAbsoluteUrl(href, base);
                if (title && link) {
                    list.push({ title, link });
                }
            }
        });

        console.log(`[DailyPharm] 발견된 기사 후보: ${list.length}건 (제목 필터링 전)`);
        return list;
    }
}


// 나머지 스크래퍼들도 동일 패턴으로 개선 (HitNews, MediPharmToday, MedicalNews, MoneyToday)
// 여기서는 공간상략 → 위 패턴 따라가면 됨

class MoneyToday extends BaseScraper {
    async getNewsList() {
        const $ = await this.fetch(`https://www.mt.co.kr/search?keyword=${this.encodedKeyword}`);
        if (!$) return [];

        const list = [];
        const base = 'https://www.mt.co.kr';

        $('.article_item, .search-result-item, .news_list li').each((i, el) => {
            const $el = $(el);
            const $titleEl = $el.find('h3, h4, .title, a strong');
            const $linkEl = $el.find('a').first();
            const $dateEl = $el.find('.date, .regdate, time, .byline');

            const title = $titleEl.text().replace(/\s+/g, ' ').trim();
            const date = $dateEl.text().trim();
            const href = $linkEl.attr('href');

            if (this.isToday(date) && title && href) {
                const link = this.makeAbsoluteUrl(href, base);
                list.push({ title, link });
            }
        });
        return list;
    }
}

//──────────────────────────────────────────────
// HitNews (hitnews.co.kr)
class HitNews extends BaseScraper {
    async getNewsList() {
        const searchUrl = `http://www.hitnews.co.kr/news/articleList.html?sc_word=${this.encodedKeyword}`;
        const $ = await this.fetch(searchUrl);
        if (!$) {
            console.warn(`[HitNews] Fetch 실패: ${searchUrl}`);
            return [];
        }

        const list = [];
        const base = 'http://www.hitnews.co.kr';
        const currentYear = new Date().getFullYear();  // 2026

        // PharmNews / bosa 계열과 동일한 구조 예상
        $('ul.type1 > li').each((i, el) => {
            const $li = $(el);

            // 제목 & 링크
            const $titleLink = $li.find('h4.titles a, h3.titles a, .titles a').first();
            if (!$titleLink.length) return;

            const title = $titleLink.text().trim();
            if (!title || title.length < 6) return;

            const href = $titleLink.attr('href');
            if (!href || !href.includes('/articleView.html?idxno=')) return;

            // 날짜
            let dateText = $li.find('em.info.dated, .dated, .date, .regdate, .info.dated').first().text().trim();
            if (!dateText) return;

            // 연도 없는 경우 (예: "01.19 18:30") 현재 연도 붙이기
            let normalized = dateText;
            if (/^\d{2}\.\d{2}\s+\d{2}:\d{2}$/.test(dateText.trim())) {
                normalized = `${currentYear}.${dateText}`;
            }

            if (this.isToday(normalized)) {
                const link = this.makeAbsoluteUrl(href, base);
                if (link) {
                    list.push({ title, link });
                }
            }
        });

        if (list.length === 0 && $('ul.type1').length === 0) {
            // 구조가 안 맞을 경우 디버깅용 로그
            console.log('[HitNews 디버그] ul.type1 요소 개수:', $('ul.type1').length);
            console.log('[HitNews 디버그] .titles a 개수:', $('.titles a').length);
        }

        console.log(`[HitNews] 오늘 발견 기사: ${list.length}건`);
        return list;
    }
}

// ──────────────────────────────────────────────
// MediPharmToday (pharmstoday.com)
class MediPharmToday extends BaseScraper {
    async getNewsList() {
        const $ = await this.fetch(`https://www.pharmstoday.com/news/articleList.html?sc_area=A&view_type=sm&sc_word=${this.encodedKeyword}`);
        if (!$) return [];

        const list = [];
        const base = 'https://www.pharmstoday.com';

        $('.titles a, .title a, .article-title a, .subject a, li a').each((i, el) => {
            const $el = $(el);
            const $item = $el.closest('.item, .list-item, li, .news-row, .article');
            const dateText = $item.find('.date, .regdate, time, .published, .timeago').first().text().trim();

            if (this.isToday(dateText)) {
                const title = $el.text().trim();
                const href = $el.attr('href');
                const link = this.makeAbsoluteUrl(href, base);

                if (title && link) {
                    list.push({ title, link });
                }
            }
        });

        return list;
    }
}

// ──────────────────────────────────────────────
// MedicalNews (bosa.co.kr / 의학신문)
class MedicalNews extends BaseScraper {
    async getNewsList() {
        const $ = await this.fetch(`http://www.bosa.co.kr/news/articleList.html?sc_word=${this.encodedKeyword}`);
        if (!$) return [];

        const list = [];
        const base = 'http://www.bosa.co.kr';

        $('.titles a, .title a, .subject a, .list-title a, .news a').each((i, el) => {
            const $el = $(el);
            const $container = $el.closest('.item, li, .article-list-item, .news-item');
            const dateText = $container.find('.date, .regdate, .wdate, time, .published').first().text().trim();

            if (this.isToday(dateText)) {
                const title = $el.text().replace(/\s+/g, ' ').trim();
                const href = $el.attr('href');
                const link = this.makeAbsoluteUrl(href, base);

                if (title && link) {
                    list.push({ title, link });
                }
            }
        });

        return list;
    }
}




// 사용 가능한 스크래퍼 매핑
const scrapersMap = {
    '더바이오': TheBio,
    '바이오타임즈': BioTimes,      // 추가
    '팜뉴스': PharmNews,
    '약업닷컴': Yakup,
    '데일리팜': DailyPharm,
    '히트뉴스': HitNews,           // 클래스 정의 필요 (위 패턴 참고)
    '메디팜스투데이': MediPharmToday,
    '의학신문': MedicalNews,
    '머니투데이': MoneyToday
};

// ──────────────────────────────────────────────
// 모니터링 로직 (거의 그대로, 로그 강화)
// ──────────────────────────────────────────────

async function runMonitoring(chatId) {
    if (!check) return;

    try {
        const keyword = myKeywords[currentKwdIndex];
        console.log(`\n───────────── ${keyword} (${currentKwdIndex+1}/${myKeywords.length}) ─────────────`);

        currentKwdIndex = (currentKwdIndex + 1) % myKeywords.length;

        for (const [name, ScraperClass] of Object.entries(scrapersMap)) {
            try {
                const scraper = new ScraperClass(keyword);
                const items = await scraper.getNewsList();

                console.log(`[${name}] ${items.length}건 발견`);

                for (const item of items) {
                    if (!scraper.validate(item.title)) continue;

                    // 필터링 로직 강화 (공백 제거 및 대소문자 통합)
                    const normalizedTitle = item.title.replace(/\s+/g, ' ').trim();
                    const hasFilter = filterKeywords.length === 0 || 
                                    filterKeywords.some(f => normalizedTitle.toLowerCase().includes(f.trim().toLowerCase()));

                    if (!hasFilter) {
                        // 왜 필터 미충족인지 디버깅 로그 남기기
                        console.log(`  └ 필터 미충족: ${normalizedTitle}`); 
                        continue;
                    }

                    const uniqueKey = `${name}_${item.title}`;
                    if (compare_map.has(uniqueKey)) continue;

                    compare_map.set(uniqueKey, true);
                    const logTime = moment().format('HH:mm');
                    await bot.sendMessage(
                        chatId,
                        `[${logTime}] [**${name}**] **${item.title}**\n\n🔗 ${item.link}`,
                        { parse_mode: 'Markdown', disable_web_page_preview: false }
                    );
                    console.log(`  └ 전송 완료 : ${item.title}`);
                }
            } catch (e) {
                console.error(`[${name}] 에러 : ${e.message}`);
            }
            await new Promise(r => setTimeout(r, 200)); // 딜레이 조금 더 늘림
        }
    } catch (err) {
        console.error('runMonitoring 에러:', err);
    }

    playAlert = setTimeout(() => runMonitoring(chatId), 5000); // 15초
}

/**
 * 4. 명령어 및 가이드 메시지
 */
const guideMessage = `
📌 **바이오 뉴스 모니터링 봇 사용법**

✅ **기본 제어**
• \`/on\` : 모니터링 시작
• \`/off\` : 모니터링 중지
• \`/list\` : 현재 종목 및 필터 리스트 확인

➕ **추가 및 삭제**
• \`/add 종목명\` : 감시 종목 추가
• \`/del 종목명\` : 감시 종목 삭제
• \`/f_add 단어\` : 필터 단어 추가
• \`/f_del 단어\` : 필터 단어 삭제

⚠️ *제목에 종목명이 포함된 뉴스만 수집합니다.*
`;

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || "";

    if (text === '/start' || text === '/help') {
        bot.sendMessage(chatId, guideMessage, { parse_mode: 'Markdown' });
    } else if (text === '/on') {
        check = true;
        compare_map.clear();
        bot.sendMessage(chatId, "🚀 모니터링을 시작합니다.");
        runMonitoring(chatId);
    } else if (text === '/off') {
        check = false;
        clearTimeout(playAlert);
        bot.sendMessage(chatId, "🛑 모니터링을 중지합니다.");
    } else if (text === '/list') {
        bot.sendMessage(chatId, `📋 **종목:** ${myKeywords.join(', ')}\n🔍 **필터:** ${filterKeywords.join(', ')}`, { parse_mode: 'Markdown' });
    } else if (text.startsWith('/add ')) {
        const k = text.split('/add ')[1].trim();
        if(k) { myKeywords = [...new Set([...myKeywords, k])]; bot.sendMessage(chatId, `✅ 추가됨: ${k}`); }
    } else if (text.startsWith('/del ')) {
        const k = text.split('/del ')[1].trim();
        myKeywords = myKeywords.filter(item => item !== k);
        bot.sendMessage(chatId, `🗑️ 삭제됨: ${k}`);
    } else if (text.startsWith('/f_add ')) {
        const f = text.split('/f_add ')[1].trim();
        if(f) { filterKeywords = [...new Set([...filterKeywords, f])]; bot.sendMessage(chatId, `🔍 필터 추가: ${f}`); }
    } else if (text.startsWith('/f_del ')) {
        const f = text.split('/f_del ')[1].trim();
        filterKeywords = filterKeywords.filter(item => item !== f);
        bot.sendMessage(chatId, `🗑️ 필터 삭제: ${f}`);
    }
});
console.log("🚀 [바이오 종목 뉴스 모니터링 봇] 서버 가동 중...");
