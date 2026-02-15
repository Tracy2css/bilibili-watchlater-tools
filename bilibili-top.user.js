// ==UserScript==
// @name         Bilibili 稍后再看 - 置顶 (手动排序)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  使用 GM_xmlhttpRequest 解决账号未登录报错，实现真正物理置顶
// @author       Gemini
// @match        *://www.bilibili.com/list/watchlater*
// @match        *://www.bilibili.com/watchlater*
// @icon         https://www.bilibili.com/favicon.ico
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 1. 强力提取 CSRF Token
    const getCsrf = () => {
        const match = document.cookie.match(/bili_jct=([^;]+)/);
        return match ? match[1] : '';
    };

    // 2. 使用 GM 专用请求，避开原生 fetch 的凭证丢失问题
    const callBiliApiGM = (url, params) => {
        return new Promise((resolve) => {
            const csrf = getCsrf();
            if (!csrf) {
                console.error("Gemini: 未能获取 CSRF Token，请确保已登录 B 站");
                resolve({ code: -101 });
                return;
            }

            const body = new URLSearchParams({ ...params, csrf }).toString();

            GM_xmlhttpRequest({
                method: "POST",
                url: url,
                data: body,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Origin": "https://www.bilibili.com",
                    "Referer": "https://www.bilibili.com/list/watchlater"
                },
                onload: function(response) {
                    const data = JSON.parse(response.responseText);
                    console.log(`Gemini API 回复 [${params.bvid || params.aid}]:`, data);
                    resolve(data);
                },
                onerror: function(err) {
                    console.error("Gemini: 请求发生网络错误", err);
                    resolve({ code: -1 });
                }
            });
        });
    };

    // 3. 物理置顶逻辑
    const doPhysicalTop = async () => {
        // 锁定勾选项：bili-card-checkbox--checked
        const activeCheckboxes = document.querySelectorAll('.bili-card-checkbox--checked');
        if (activeCheckboxes.length === 0) {
            alert("未检测到选中视频。请先开启【批量管理】并勾选视频。");
            return;
        }

        const btn = document.getElementById('gemini-final-btn');
        btn.innerText = "正在物理移位...";
        btn.style.background = "#666";

        const tasks = [];
        activeCheckboxes.forEach(box => {
            const card = box.closest('.bili-video-card');
            if (card) {
                const link = card.querySelector('a.bili-cover-card');
                if (link && link.href) {
                    const u = new URL(link.href, window.location.origin);
                    const bvid = u.searchParams.get('bvid');
                    const aid = u.searchParams.get('oid');
                    if (bvid && aid) tasks.push({ bvid, aid });
                }
            }
        });

        let successCount = 0;
        // 必须按任务顺序处理
        for (let i = 0; i < tasks.length; i++) {
            const item = tasks[i];
            btn.innerText = `处理中(${i + 1}/${tasks.length})`;

            // 第一步：删除
            const delRes = await callBiliApiGM('https://api.bilibili.com/x/v2/history/toview/del', { aid: item.aid });

            // 第二步：重新添加（删除成功或原本就在处理状态下）
            if (delRes.code === 0 || delRes.code === -400) {
                await new Promise(r => setTimeout(r, 400)); // 增加延迟防止被封
                const addRes = await callBiliApiGM('https://api.bilibili.com/x/v2/history/toview/add', { bvid: item.bvid });
                if (addRes.code === 0) successCount++;
            }
            await new Promise(r => setTimeout(r, 400));
        }

        if (successCount > 0) {
            btn.innerText = "同步成功，正在重载...";
            setTimeout(() => { window.location.reload(); }, 1000);
        } else {
            alert("置顶失败。请在控制台(F12)查看具体报错原因。");
            btn.innerText = "置顶选中";
            btn.style.background = "#fb7299";
        }
    };

    // 4. 界面注入
    const injectUI = () => {
        if (document.getElementById('gemini-final-btn')) return;
        const btn = document.createElement('div');
        btn.id = 'gemini-final-btn';
        btn.innerHTML = '置顶选中';
        btn.style = `
            position: fixed; right: 30px; bottom: 100px; z-index: 100000;
            background: #fb7299; color: white; padding: 12px 24px;
            border-radius: 8px; cursor: pointer; box-shadow: 0 4px 12px rgba(251,114,153,0.4);
            font-weight: bold; font-size: 14px; user-select: none; display: none;
        `;
        btn.onclick = (e) => { e.preventDefault(); doPhysicalTop(); };
        document.body.appendChild(btn);
    };

    setInterval(() => {
        if (document.body) {
            injectUI();
            const hasCheckboxes = document.querySelector('.bili-card-checkbox');
            const btn = document.getElementById('gemini-final-btn');
            if (btn) btn.style.display = hasManageMode(hasCheckboxes) ? 'block' : 'none';
        }
    }, 1500);

    function hasManageMode(el) {
        if (!el) return false;
        // 如果勾选框已经显示（不是隐藏状态），说明进入了管理模式
        return window.getComputedStyle(el).display !== 'none';
    }

})();
