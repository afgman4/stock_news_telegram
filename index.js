const TelegramBot = require('node-telegram-bot-api');
const axios = require("axios");
const cheerio = require("cheerio");
const moment = require('moment');
const dns = require('dns');
const https = require('https');

if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

// --- 1. 설정 및 토큰 ---
// const token = '8483984900:AAH3mF9GKrXb8s8k7DefCfke7Xw6J9FzpDs';
const token='8580951991:AAGVAlC_sjm7g8vYBlU1yaD4NL0EZ1MwHbg';
const bot = new TelegramBot(token, { polling: true });

let check = false;
let playAlert = null;
let compare_map = new Map();
let currentKwdIndex = 0;

// --- 2. 종목 및 정규식 설정 ---
let myKeywords = [
    '바이젠셀', '젠큐릭스', '큐라클', '압타바이오', '퓨쳐켐', '메지온', 
    '지아이이노베이션', '에이프릴바이오', '큐리언트', '티움바이오', 
    '앱클론', '오스코텍', '박셀바이오', '지씨셀', '셀리드',
    '제넥신', '유틸렉스', '고바이오랩', '올릭스', '코오롱티슈진', 
    '디앤디파마텍', '넥스트바이오메디컬', '보로노이', '샤페론', '브릿지바이오테라퓨틱스',
    '에스씨엠생명과학', '카이노스메드', '이수앱지스', '안트로젠', '아이진', '펩트론', 
    '인벤티지랩', '코아스템켐온', '큐로셀', '바이오다인', '메드팩토', '와이바이오로직스', 
    '에이비온', '지노믹트리', '파로스아이바이오', '신테카바이오', '에스엘바이오닉스', 
    '에이비엘바이오', '지투지바이오', '나이벡', '레고켐바이오'
];

const goodNewsPattern = new RegExp("(\\[속보\\]|\\[특징주\\]|CSR|톱라인|Top-line|FDA|승인|허가|특허|획득|NDA|임상\\s*[1-3]상|결과\\s*보고서|성공|L/O|기술\\s*수출|계약|공시)", "i");
const badNewsPattern = new RegExp("(검찰\\s*조사|횡령|배임|상장\\s*폐지|관리\\s*종목|임상\\s*중단|실패|반려|부적격|불성실|허위|조작)", "i");

const delay = ms => new Promise(res => setTimeout(res, ms));

/* --- 3. 베이스 스크래퍼 --- */
class BaseScraper {
    constructor(keyword) {
        this.keyword = keyword;
        this.encodedKeyword = encodeURIComponent(keyword);
    }
    async fetch(url) {
        try {
            const res = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
                timeout: 10000, 
                family: 4,
                // 모든 사이트에 대해 구형 SSL 허용 옵션 적용 (안전성)
                httpsAgent: new https.Agent({
                    secureOptions: require('constants').SSL_OP_LEGACY_SERVER_CONNECT
                })
            });
            return res?.data ? cheerio.load(res.data) : null;
        } catch (e) { return null; }
    }
    isToday(dateText) {
        if (!dateText) return false;
        const now = moment();
        const formats = [now.format('YYYY.MM.DD'), now.format('MM.DD'), now.format('YYYY-MM-DD')];
        const terms = ['시간전', '분전', '초전', '방금', '오늘', '시전'];
        return formats.some(f => dateText.includes(f)) || terms.some(t => dateText.includes(t));
    }
    makeAbsoluteUrl(href, base) {
        if (!href) return '';
        return href.startsWith('http') ? href : new URL(href, base).href;
    }
}

/* --- 4. 언론사별 클래스 (총 11개사) --- */

class YonhapNews extends BaseScraper {
    async getNewsList() {
        // 보내주신 연합뉴스 전용 API 주소
        const url = `https://ars.yna.co.kr/api/v2/search.basic?query=${this.encodedKeyword}&page_no=1&page_size=10&scope=all&sort=date&channel=basic_kr&div_code=all`;
        
        try {
            const res = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
                timeout: 5000,
                // 이 부분이 핵심입니다: 구형 SSL 연결을 허용합니다.
                httpsAgent: new https.Agent({
                    rejectUnauthorized: false, // 인증서 무시 (선택사항)
                    secureOptions: require('constants').SSL_OP_LEGACY_SERVER_CONNECT // 구형 서버 연결 허용
                })
            });

            const data = res.data;
            const list = [];

            // JSON 구조 분석: YIB_KR_A -> result 배열에 뉴스 데이터가 있음
            if (data && data.YIB_KR_A && data.YIB_KR_A.result) {
                data.YIB_KR_A.result.forEach(item => {
                    const title = item.TITLE.replace(/<b>|<\/b>|&quot;/g, ''); // 태그 및 특수문자 제거
                    const rawDate = item.DATETIME; // 예: "20250521101358"
                    
                    // 날짜 포맷팅 (YYYYMMDD... -> YYYY-MM-DD)
                    const formattedDate = `${rawDate.substring(0,4)}-${rawDate.substring(4,6)}-${rawDate.substring(6,8)}`;
                    
                    // 기사 상세 링크 생성 (CID 활용)
                    const link = `https://www.yna.co.kr/view/${item.CID}`;

                    if (this.isToday(formattedDate)) {
                        list.push({ title, link });
                    }
                });
            }
            return list;
        } catch (e) {
            console.log(`[연합뉴스 API 에러] ${e.message}`);
            return [];
        }
    }
}
class Edaily extends BaseScraper {
    async getNewsList() {
        // 보내주신 최신순 정렬 주소 적용
        const url = `https://www.edaily.co.kr/search/index?source=total&keyword=${this.encodedKeyword}&sort=latest`;
        const $ = await this.fetch(url);
        const list = [];

        if ($) {
            // 구조 분석 결과: newsbox_04 클래스를 가진 div가 개별 뉴스 단위입니다.
            $('.newsbox_04').each((i, el) => {
                const title = $(el).find('.newsbox_texts li').first().text().trim();
                const date = $(el).find('.author_category').text().replace(/\s+/g, ' ').trim(); // "2025.12.16 I ..."
                const link = $(el).find('a').attr('href');

                // 오늘 날짜인지 확인 (BaseScraper의 isToday 활용)
                if (title && this.isToday(date)) {
                    list.push({
                        title: title,
                        link: this.makeAbsoluteUrl(link, 'https://www.edaily.co.kr')
                    });
                }
            });
        }
        return list;
    }
}
class TheBio extends BaseScraper { async getNewsList() { const $ = await this.fetch(`https://www.thebionews.net/news/articleList.html?sc_word=${this.encodedKeyword}`); const list = []; if ($) $('.article-list .item').each((i, el) => { const title = $(el).find('.titles a').text().trim(); const date = $(el).find('.date').text().trim(); const link = $(el).find('a').attr('href'); if (this.isToday(date)) list.push({ title, link: this.makeAbsoluteUrl(link, 'https://www.thebionews.net') }); }); return list; } }
class PharmNews extends BaseScraper { async getNewsList() { const $ = await this.fetch(`https://www.pharmnews.com/news/articleList.html?sc_word=${this.encodedKeyword}`); const list = []; if ($) $('.type1 li').each((i, el) => { const title = $(el).find('.titles a').text().trim(); const date = $(el).find('.dated').text().trim(); const link = $(el).find('.titles a').attr('href'); if (this.isToday(date)) list.push({ title, link: this.makeAbsoluteUrl(link, 'https://www.pharmnews.com') }); }); return list; } }
class DailyPharm extends BaseScraper { async getNewsList() { const $ = await this.fetch(`https://www.dailypharm.com/user/news/search?searchKeyword=${this.encodedKeyword}`); const list = []; if ($) $('.act_list_sty2 li').each((i, el) => { const title = $(el).find('.lin_title').text().trim(); const date = $(el).find('.lin_date').text().trim(); const link = $(el).find('a').attr('href'); if (this.isToday(date)) list.push({ title, link: this.makeAbsoluteUrl(link, 'https://www.dailypharm.com') }); }); return list; } }
class BioTimes extends BaseScraper { async getNewsList() { const $ = await this.fetch(`http://www.biotimes.co.kr/news/articleList.html?sc_word=${this.encodedKeyword}`); const list = []; if ($) $('.list-block, .item').each((i, el) => { const title = $(el).find('.title a, .titles a').text().trim(); const date = $(el).find('.date').text().trim(); const link = $(el).find('a').attr('href'); if (this.isToday(date)) list.push({ title, link: this.makeAbsoluteUrl(link, 'http://www.biotimes.co.kr') }); }); return list; } }
class Yakup extends BaseScraper { async getNewsList() { const $ = await this.fetch(`https://www.yakup.com/search/index.html?csearch_word=${this.encodedKeyword}`); const list = []; if ($) $('.news_item, li').each((i, el) => { const title = $(el).find('a').text().trim(); const date = $(el).find('.date').text().trim(); const link = $(el).find('a').attr('href'); if (title.length > 5 && this.isToday(date)) list.push({ title, link: this.makeAbsoluteUrl(link, 'https://www.yakup.com') }); }); return list; } }
class HitNews extends BaseScraper { async getNewsList() { const $ = await this.fetch(`http://www.hitnews.co.kr/news/articleList.html?sc_word=${this.encodedKeyword}`); const list = []; if ($) $('.type1 li').each((i, el) => { const title = $(el).find('.titles a').text().trim(); const date = $(el).find('.dated').text().trim(); const link = $(el).find('.titles a').attr('href'); if (this.isToday(date)) list.push({ title, link: this.makeAbsoluteUrl(link, 'http://www.hitnews.co.kr') }); }); return list; } }
class MediPharmToday extends BaseScraper { async getNewsList() { const $ = await this.fetch(`https://www.pharmstoday.com/news/articleList.html?sc_word=${this.encodedKeyword}`); const list = []; if ($) $('.article-list .item').each((i, el) => { const title = $(el).find('.titles a').text().trim(); const date = $(el).find('.date').text().trim(); const link = $(el).find('a').attr('href'); if (this.isToday(date)) list.push({ title, link: this.makeAbsoluteUrl(link, 'https://www.pharmstoday.com') }); }); return list; } }
class MedicalNews extends BaseScraper { async getNewsList() { const $ = await this.fetch(`http://www.bosa.co.kr/news/articleList.html?sc_word=${this.encodedKeyword}`); const list = []; if ($) $('.article-list .item').each((i, el) => { const title = $(el).find('.titles a').text().trim(); const date = $(el).find('.date').text().trim(); const link = $(el).find('a').attr('href'); if (this.isToday(date)) list.push({ title, link: this.makeAbsoluteUrl(link, 'http://www.bosa.co.kr') }); }); return list; } }
class MoneyToday extends BaseScraper { async getNewsList() { const $ = await this.fetch(`https://www.mt.co.kr/search?keyword=${this.encodedKeyword}`); const list = []; if ($) $('.article_item').each((i, el) => { const title = $(el).find('h3').text().trim(); const date = $(el).find('.date').text().trim(); const link = $(el).find('a').first().attr('href'); if (this.isToday(date)) list.push({ title, link }); }); return list; } }

// 매핑 (속보지 2개 + 전문지 9개)
const scrapersMap = { 
    '연합뉴스': YonhapNews, '이데일리': Edaily, '더바이오': TheBio, 
    '팜뉴스': PharmNews, '데일리팜': DailyPharm, '바이오타임즈': BioTimes, 
    '약업닷컴': Yakup, '히트뉴스': HitNews, '메디팜스투데이': MediPharmToday, 
    '의학신문': MedicalNews, '머니투데이': MoneyToday 
};

/* --- 진단용 모니터링 엔진 --- */
async function runMonitoring(chatId) {
    if (!check) return;
    const logTime = () => moment().format('HH:mm:ss');
    const batchSize = 15; 
    const currentBatch = [];

    for (let i = 0; i < batchSize; i++) {
        const kwd = myKeywords[currentKwdIndex];
        currentBatch.push(kwd);
        currentKwdIndex = (currentKwdIndex + 1) % myKeywords.length;
    }

    console.log(`\n[${logTime()}] 🚀 검사 시작: ${currentBatch.length}개 종목`);

    /* --- 매칭 로직 강화 버전 --- */
    // ... (배치 생성 부분 동일)

    /* --- 타이틀 강제 노출 버전 --- */
    await Promise.all(currentBatch.map(async (keyword) => {
        try {
            const results = await Promise.all(Object.entries(scrapersMap).map(async ([site, Scraper], i) => {
                await delay(i * 30); 
                try { 
                    const list = await new Scraper(keyword).getNewsList();
                    return { site, items: list }; 
                } catch (e) { return { site, items: [] }; }
            }));

            for (const { site, items } of results) {
                for (const item of items) {
                    const title = item.title.trim();
                    
                    // 1. [무조건 출력] 데이터를 가져왔다면 제목부터 보여줌
                    console.log(`[데이터확인][${keyword}] ${site} : ${title}`);

                    // 2. 키워드 매칭 검사 (공백 제거 후 비교)
                    const cleanTitle = title.replace(/\s+/g, "").toLowerCase();
                    const cleanKeyword = keyword.trim().toLowerCase();
                    const isMatched = cleanTitle.includes(cleanKeyword);

                    if (!isMatched) {
                        console.log(`   └ ❌ 매칭실패 (종목명 없음)`);
                        continue;
                    }

                    // 3. 필터링 검사 (호재/악재)
                    const isGood = goodNewsPattern.test(title);
                    const isBad = badNewsPattern.test(title);

                    if (isGood && !isBad) {
                        const uniqueKey = `${site}_${title}`;
                        if (!compare_map.has(uniqueKey)) {
                            compare_map.set(uniqueKey, true);
                            await bot.sendMessage(chatId, `🔔 **속보**\n\n📌 #${keyword}\n📰 ${site}\n📝 ${title}\n\n🔗 ${item.link}`, { parse_mode: 'Markdown' });
                            console.log(`   └ ✅ [전송완료]`);
                        } else {
                            console.log(`   └ ⏭ [중복패스]`);
                        }
                    } else {
                        const reason = isBad ? "부정어 포함" : "호재 키워드 없음";
                        console.log(`   └ ⚠️ [미달] 사유: ${reason}`);
                    }
                }
            }
        } catch (err) { console.log(`[에러] ${err.message}`); }
    }));

    

    if (check) playAlert = setTimeout(() => runMonitoring(chatId), 1000); 
}


bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || "";

    if (text === '/on') {
        if (!check) {
            check = true;
            compare_map.clear();
            bot.sendMessage(chatId, "🚀 11개 언론사 모니터링 시작");
            runMonitoring(chatId);
        }
    } else if (text === '/off') {
        check = false;
        clearTimeout(playAlert);
        bot.sendMessage(chatId, "🛑 모니터링 중지");
    } else if (text.startsWith('/test')) {
        const testKeyword = text.replace('/test', '').trim();
        if (!testKeyword) return bot.sendMessage(chatId, "⚠️ 종목명을 입력하세요.");

        bot.sendMessage(chatId, `🔍 [${testKeyword}] 통합 구조 테스트 중...`);

        try {
            // 1. 연합뉴스 API 테스트
            const yonhapUrl = `https://ars.yna.co.kr/api/v2/search.basic?query=${encodeURIComponent(testKeyword)}&page_no=1&page_size=5&sort=date&channel=basic_kr`;
            const yRes = await axios.get(yonhapUrl, { 
                timeout: 5000,
                httpsAgent: new https.Agent({ secureOptions: require('constants').SSL_OP_LEGACY_SERVER_CONNECT })
            });
            
            if (yRes.data?.YIB_KR_A?.result?.length > 0) {
                const item = yRes.data.YIB_KR_A.result[0];
                const yTitle = item.TITLE.replace(/<b>|<\/b>|&quot;/g, '').trim();
                await bot.sendMessage(chatId, `✅ **연합뉴스(API):** ${yTitle}\n🔗 https://www.yna.co.kr/view/${item.CID}`);
            }

            // 2. 이데일리 HTML 테스트
            const edailyTester = new Edaily(testKeyword);
            const $ = await edailyTester.fetch(`https://www.edaily.co.kr/search/index?source=total&keyword=${encodeURIComponent(testKeyword)}&sort=latest`);
            
            if ($ && $('.newsbox_04').length > 0) {
                const eTitle = $('.newsbox_04').first().find('.newsbox_texts li').first().text().trim();
                const eLink = $('.newsbox_04').first().find('a').attr('href');
                await bot.sendMessage(chatId, `✅ **이데일리(HTML):** ${eTitle}\n🔗 ${edailyTester.makeAbsoluteUrl(eLink, 'https://www.edaily.co.kr')}`);
            }

        } catch (err) {
            await bot.sendMessage(chatId, `❌ 테스트 중 오류 발생: ${err.message}`);
        }
    }   
    
});




console.log("✅ 연합/이데일리 포함 11개사 감시 시스템 가동...");