# きいて、とろう！ 百人一首

小学校低学年向けの小倉百人一首ゲームです。上の句を聞いて、3枚の札から選びます。

- **かみのく**では、聞いた上の句と同じ札を選びます。
- **しものく**では、聞いた上の句に続く下の句を選びます。
- 札は**ひらがな**と**かんじあり**を切り替えられます。
- まちがえても選び直せます。最初の1回で取ると星が1つつきます。
- 10問ごとに区切り、続けると全100首が一度ずつ出ます。時間制限はありません。

読み上げにはブラウザーの日本語音声を使います。デバイスやブラウザーの設定によっては、日本語音声を追加する必要があります。「もじで みる」を押すと、読み上げる上の句を画面でも確認できます。ひらがなの札は、低学年でも音と結び付けやすいように、読み方で表示します。

本文・読みの参照元は[文化ネット「小倉百人一首かるた 歌一覧」](https://www.bunkanet.jp/manabi/hyakunin-isshu-karuta/element/)です。

## Web版のローカル実行

出題・判定・得点は Rust で実装し、WebAssembly としてビルドします。画面と読み上げはブラウザー標準の HTML・CSS・JavaScript を使います。Node.js と npm が使える環境で次のコマンドを実行し、[http://localhost:8787](http://localhost:8787) を開きます。

```sh
npx --yes wrangler@4 dev
```

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
