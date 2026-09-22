# Corporation Map

日本全国の「企業・官公庁・公共機関」を地図上から探索する、地図主役のWebアプリMVPです。Google Maps APIは使わず、LeafletとOpenStreetMapで実装しています。

## 使用した技術

- HTML / CSS / JavaScript ES Modules
- Leaflet
- Leaflet.markercluster
- OpenStreetMap タイル
- GitHub Pagesで配信しやすい静的ファイル構成

## ディレクトリ構成

```text
.
├── index.html
├── package.json
├── README.md
├── .github/workflows/pages.yml
└── src
    ├── app.js
    ├── styles.css
    ├── data/nikkei225Companies.js
    ├── data/mockPlaces.js
    ├── models/place.js
    ├── providers
    │   ├── PlaceProvider.js
    │   ├── MockPlaceProvider.js
    │   ├── CompanyProvider.js
    │   ├── GovernmentProvider.js
    │   └── OpenStreetMapProvider.js
    └── services/PlaceService.js
```

## 地図データの取得元

地図タイルはOpenStreetMapを使用しています。Dark Modeでは同じOpenStreetMapタイルの明度をCSSで調整しています。

初期MVPの施設データは `src/data/mockPlaces.js` から読み込みます。企業データは `src/data/nikkei225Companies.js` に日経225構成銘柄225社を収録しています。日経225の構成銘柄はNikkei Indexes公式の構成銘柄ページ（Update: Sep/18/2026）を基準にしています。

官公庁データは少量のMock Dataです。将来的には政府オープンデータまたはOpenStreetMap POIへ接続する想定です。

日経225データのうち、詳細住所をまだ持っていない銘柄は本社所在地エリアの代表点付近に配置しています。今後、Gビズインフォや法人番号公表サイト、各社IRの所在地情報と接続して精度を上げる前提です。

## Placeモデル

UIはデータソースの違いを直接扱わず、Provider層で次の共通モデルへ正規化します。

```js
{
  id,
  name,
  type, // company | government
  category,
  address,
  latitude,
  longitude,
  website,
  description,
  source
  stockCode // 日経225企業の場合
}
```

MVPでは本社判定、法人番号、資本金、従業員数なども存在する場合だけ表示します。

## Providerの追加方法

1. `src/providers/PlaceProvider.js` を継承するProviderを作成します。
2. 外部API固有のレスポンスを `Place` 形式へ `normalize()` で変換します。
3. `src/app.js` の `PlaceService` 初期化にProviderを追加します。

```js
const placeService = new PlaceService({
  providers: [
    new MockPlaceProvider(),
    new CompanyProvider({ endpoint: "..." }),
  ],
});
```

## 起動方法

依存パッケージのインストールは不要です。リポジトリ直下で次を実行してください。

```bash
npm run dev
```

その後、ブラウザで `http://localhost:4173` を開きます。

Pythonを直接使う場合は次でも起動できます。

```bash
python -m http.server 4173
```

## 今後Gビズインフォ等の実データへ接続する箇所

- 日経225企業データ: `src/data/nikkei225Companies.js`
- 企業API接続: `src/providers/CompanyProvider.js`
- 官公庁データ: `src/providers/GovernmentProvider.js`
- OpenStreetMap POI: `src/providers/OpenStreetMapProvider.js`
- Provider統合・検索・フィルター: `src/services/PlaceService.js`

現在はUI体験を優先し、MockProviderで `Map -> Search -> Filter -> Marker -> Side Panel -> Detail Panel` が一通り動く状態にしています。
# 企業・官公庁マップ

日本全国の企業・官公庁を地図上から探せる、個人利用向けのWebアプリです。日経平均株価の構成225銘柄と官公庁を収録しています。

## スマホで使う

GitHub Pagesの公開URLをスマートフォンで開き、ホーム画面に追加してください。以後はホーム画面の「企業マップ」アイコンから、通常のアプリのように起動できます。

- iPhone/iPad: Safariの共有メニューから「ホーム画面に追加」
- Android: Chromeのメニューから「アプリをインストール」または「ホーム画面に追加」

初回表示後はアプリ本体を端末にキャッシュします。地図表示や最新の地図データには通信が必要です。

## ローカル起動

```powershell
npm run dev
```
