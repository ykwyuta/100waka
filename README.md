# きいて、とろう！ 百人一首

小学校低学年向けの小倉百人一首ゲームです。上の句を聞いて、3枚の札から選びます。

- **しものく**（はじめの設定）では、聞いた上の句に続く下の句を選びます。札をタップ・クリックすると、その下の句も読み上げます。
- **かみのく**では、聞いた上の句と同じ札を選びます。
- 札は**ひらがな**と**かんじあり**を切り替えられます。
- 100首それぞれの札に、歌の情景や気持ちを表す画像生成イラストを添えています。上の句・下の句の切り替え後も、同じ歌の札には同じ絵が出ます。
- まちがえても選び直せます。最初の1回で取ると星が1つつきます。
- 10問ごとに区切り、続けると全100首が一度ずつ出ます。時間制限はありません。

読み上げは [VOICEVOX](https://voicevox.hiroshiba.jp/) で作った音声で、ずんだもん・四国めたん・春日部つむぎのだれかが問題ごとにランダムに読みます。句ごとに少し間を取り、ややゆっくり読みます。「もじで みる」を押すと、読み上げる上の句を画面でも確認できます。ひらがなの札は、低学年でも音と結び付けやすいように、読み方で表示します。

本文・読みの参照元は[文化ネット「小倉百人一首かるた 歌一覧」](https://www.bunkanet.jp/manabi/hyakunin-isshu-karuta/element/)です。

## 百人一首ずかん

「ずかん」から100人の歌人と100首の歌を調べられます。「かじん」には名前の読みと短い人物紹介、「うたの いみ」には上の句・下の句と、歌の意味（いみ）、むずかしい言葉の説明（ことば）、歌がよまれたわけや作者のエピソード（かいせつ）があります。「うたを きく」を押すとその歌を上の句から下の句まで、「かいせつを きく」を押すと解説を、VOICEVOXの声で読み上げます。名前、ひらがな、句の一部、歌番号で探せます。

歌人の画像は生成イラストで、一部は当時の役目や服装のイメージを共用しています。歌の解説には札と同じ情景イラストを使っています。

## Web版のローカル実行

出題・判定・得点は Rust で実装し、WebAssembly としてビルドします。画面と読み上げはブラウザー標準の HTML・CSS・JavaScript を使います。Node.js と npm が使える環境で次のコマンドを実行し、[http://localhost:8787](http://localhost:8787) を開きます。

```sh
npx --yes wrangler@4 dev
```

## 読み上げ音声の作り直し

音声は `web/voice/` に入っています。作り直すときは VOICEVOX（エンジン）を起動し、ffmpeg を用意して実行します。歌番号を付けると、その歌だけ作り直します。

```sh
python scripts/voicevox.py
```

上の句・下の句だけ、解説だけを作るときは `--parts kami,shimo` や `--parts kaisetsu` を付けます。`--check` を付けると、解説を読み上げる文（読みを直したもの）を確認できます。

## テストとビルド

```sh
cargo test --locked
bash scripts/build-web.sh
```

GitHub Actions のビルドから、静的ファイル `100waka-web` を取得できます。

## Cloudflare Workers への公開

Workers Builds でこのリポジトリを接続する場合はビルドコマンド欄を空にし、デプロイコマンドを `npx wrangler deploy` に設定します。Wrangler が `wrangler.toml` のビルド設定を実行します。

手元から公開する場合は次のコマンドを実行します。

```sh
npx --yes wrangler@4 login
npx --yes wrangler@4 deploy
```

## Cloudflare Pages への公開

初回だけ Pages プロジェクトを作成します。

```sh
npx --yes wrangler@4 login
npx --yes wrangler@4 pages project create 100waka --production-branch master
```

本番に公開します。

```sh
bash scripts/build-web.sh
(cd cloudflare/pages && npx --yes wrangler@4 pages deploy --branch master)
```
