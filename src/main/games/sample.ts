/**
 * src/main/games/sample.ts
 *
 * 主机平台示例数据兜底 — 当 IsThereAnyDeal key 未配置时，Xbox / PlayStation / Switch
 * 三个平台用它填充，保证 UI 永远不空白。每条 source:'sample'，renderer 会显示
 * "示例" 徽标以明确数据性质。
 */
"use strict";

const { toGameDeal } = require("./normalize");

function mk(platform: string, list: any[]): any[] {
  return list.map((g) =>
    toGameDeal({
      platform,
      source: "sample",
      store: g.store || cap(platform),
      ...g,
    }),
  );
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const XBOX = mk("xbox", [
  { id: "xbox-1", title: "Forza Horizon 5", salePrice: 29.99, normalPrice: 59.99, savings: 50, rating: 92, popular: 98, releaseDate: "2021-11-09" },
  { id: "xbox-2", title: "Halo Infinite (Campaign)", salePrice: 19.99, normalPrice: 59.99, savings: 67, rating: 87, popular: 88, releaseDate: "2021-12-08" },
  { id: "xbox-3", title: "Microsoft Flight Simulator", salePrice: 34.99, normalPrice: 69.99, savings: 50, rating: 90, popular: 80, releaseDate: "2020-08-18" },
  { id: "xbox-4", title: "Gears 5", salePrice: 9.99, normalPrice: 39.99, savings: 75, rating: 84, popular: 70, releaseDate: "2019-09-10" },
  { id: "xbox-5", title: "Sea of Thieves", salePrice: 14.99, normalPrice: 39.99, savings: 63, rating: 85, popular: 76, releaseDate: "2020-04-30" },
  { id: "xbox-6", title: "DOOM Eternal", salePrice: 11.99, normalPrice: 39.99, savings: 70, rating: 88, popular: 72, releaseDate: "2020-03-20" },
  { id: "xbox-7", title: "Fallout 76 (Steel Dawn)", salePrice: 0, normalPrice: 39.99, savings: 100, isFree: true, freeUntil: "2026-07-23T00:00:00Z", popular: 90, releaseDate: "2018-11-14" },
  { id: "xbox-8", title: "Psychonauts 2", salePrice: 17.99, normalPrice: 59.99, savings: 70, rating: 89, popular: 64, releaseDate: "2021-08-25" },
]);

const PLAYSTATION = mk("playstation", [
  { id: "ps-1", title: "God of War Ragnarök", salePrice: 39.99, normalPrice: 69.99, savings: 43, rating: 94, popular: 97, releaseDate: "2022-11-09" },
  { id: "ps-2", title: "Marvel's Spider-Man 2", salePrice: 39.99, normalPrice: 69.99, savings: 43, rating: 91, popular: 95, releaseDate: "2023-10-20" },
  { id: "ps-3", title: "The Last of Us Part I", salePrice: 29.99, normalPrice: 69.99, savings: 57, rating: 89, popular: 86, releaseDate: "2022-09-02" },
  { id: "ps-4", title: "Horizon Forbidden West", salePrice: 34.99, normalPrice: 69.99, savings: 50, rating: 90, popular: 84, releaseDate: "2022-02-18" },
  { id: "ps-5", title: "Ghost of Tsushima Director's Cut", salePrice: 24.99, normalPrice: 59.99, savings: 58, rating: 93, popular: 82, releaseDate: "2021-08-20" },
  { id: "ps-6", title: "Ratchet & Clank: Rift Apart", salePrice: 19.99, normalPrice: 69.99, savings: 71, rating: 90, popular: 74, releaseDate: "2021-06-11" },
  { id: "ps-7", title: "MLB The Show 24", salePrice: 0, normalPrice: 69.99, savings: 100, isFree: true, freeUntil: "2026-07-21T00:00:00Z", popular: 78, releaseDate: "2024-03-19" },
  { id: "ps-8", title: "Returnal", salePrice: 29.99, normalPrice: 79.99, savings: 63, rating: 91, popular: 70, releaseDate: "2021-04-30" },
]);

const SWITCH = mk("switch", [
  { id: "sw-1", title: "The Legend of Zelda: Tears of the Kingdom", salePrice: 49.99, normalPrice: 69.99, savings: 29, rating: 96, popular: 99, releaseDate: "2023-05-12" },
  { id: "sw-2", title: "Super Mario Bros. Wonder", salePrice: 44.99, normalPrice: 59.99, savings: 25, rating: 92, popular: 90, releaseDate: "2023-10-20" },
  { id: "sw-3", title: "Metroid Prime Remastered", salePrice: 29.99, normalPrice: 39.99, savings: 25, rating: 94, popular: 80, releaseDate: "2023-02-08" },
  { id: "sw-4", title: "Pikmin 4", salePrice: 39.99, normalPrice: 59.99, savings: 33, rating: 88, popular: 72, releaseDate: "2023-07-21" },
  { id: "sw-5", title: "Mario Kart 8 Deluxe", salePrice: 39.99, normalPrice: 59.99, savings: 33, rating: 90, popular: 92, releaseDate: "2017-04-28" },
  { id: "sw-6", title: "Xenoblade Chronicles 3", salePrice: 39.99, normalPrice: 59.99, savings: 33, rating: 89, popular: 68, releaseDate: "2022-07-29" },
  { id: "sw-7", title: "NBA 2K24 (Arcade Edition)", salePrice: 0, normalPrice: 19.99, savings: 100, isFree: true, freeUntil: "2026-07-25T00:00:00Z", popular: 60, releaseDate: "2023-09-08" },
  { id: "sw-8", title: "Animal Crossing: New Horizons", salePrice: 44.99, normalPrice: 59.99, savings: 25, rating: 86, popular: 85, releaseDate: "2020-03-20" },
]);

const SAMPLE_BY_PLATFORM: Record<string, any[]> = {
  xbox: XBOX,
  playstation: PLAYSTATION,
  switch: SWITCH,
};

export function getSampleDeals(platform: string): any[] {
  return SAMPLE_BY_PLATFORM[platform] ? SAMPLE_BY_PLATFORM[platform].slice() : [];
}

module.exports = { getSampleDeals };
