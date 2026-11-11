# Japanese signing page: comprehension test (before anyone in Japan uses it)

**Who:** 5–8 native Japanese speakers who are not developers and have never heard of Shōkai. Mixed ages; at least two who shop online often and two who rarely do. Fictional data only; no real money, keys or accounts.

**Setup (10 minutes each, one at a time):** open the Japanese sample raise screen (the local reference page with `owner_language: "ja-JP"`) on a phone. Say only: 「AIエージェントがあなたの代わりに買い物をしていて、この画面が届きました。普段どおりに読んで、どうするか決めてください。」 Don't explain Shōkai, the agent, passkeys or the 詳細 section. Don't help. Note where they pause or scroll.

**Then ask, in this order, and write down their own words:**
1. いくらの支払いを承認しようとしていますか？
2. 6,000円は何の金額ですか？
3. この承認は、ほかの購入にもう一度使えますか？
4. 店舗（Linden & Pike Teas）は確認済みだと思いますか？
5. 承認ボタンを押すと何が起きますか？（押さなかった場合は？）

**Correct answers:** (1) 4,000円の購入1件。(2) これまでの2,000円と今回の4,000円を合わせた合計で、新しい6,000円の購入ではない。(3) 使えない（この購入1件だけ）。(4) 確認されていない（サイトの自己申告）。(5) この購入の承認内容にパスキーで署名する。購入の完了ではない。押さなければ期限後に自動的に不承認。

**Pass rule:** every participant answers questions 1–3 correctly, and at least 80% answer 4 and 5 correctly. Any participant who thinks they are approving a new 6,000円 purchase, or a lasting higher limit, is a fail for the design, whatever else they get right. Fix the wording and test again with new participants.

**Afterwards:** ask a Japanese security professional to read the signed text and the terms パスキー認証, 電子署名 and 権限の委任 separately.
