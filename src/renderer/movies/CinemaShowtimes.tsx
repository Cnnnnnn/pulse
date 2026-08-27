/**
 * 内地猫眼排片：影院列表 → 点进一家拉场次。
 * 港澳 / TMDB / 示例片不展示。支持行政区 / 商圈筛选。
 */
import { useEffect, useState } from "preact/hooks";
import { api } from "../api.ts";
import {
  getMovieCity,
  movieShowDay,
  supportsMaoyanShowtimes,
} from "../../shared/movies-constants.ts";

type Cinema = {
  id: string;
  name: string;
  address?: string;
  distance?: string;
  sellPrice?: string;
  hallTypes?: string[];
  maoyanUrl?: string;
};

type ShowSlot = {
  time: string;
  hall?: string;
  lang?: string;
  type?: string;
  price?: string;
};

type ShowDay = {
  date?: string;
  label?: string;
  slots: ShowSlot[];
};

type District = {
  id: number;
  name: string;
  count?: number;
  areas?: { id: number; name: string; count?: number }[];
};

export function CinemaShowtimes({
  movieId,
  cityId,
  source,
  isSample,
}: {
  movieId: string;
  cityId: number;
  source?: string;
  isSample?: boolean;
}) {
  const city = getMovieCity(cityId);
  const canShow =
    supportsMaoyanShowtimes(cityId) &&
    !isSample &&
    source !== "tmdb" &&
    source !== "sample";

  const [day, setDay] = useState(movieShowDay(0));
  const [districtId, setDistrictId] = useState(-1);
  const [areaId, setAreaId] = useState(-1);
  const [districts, setDistricts] = useState<District[]>([]);
  const [cinemas, setCinemas] = useState<Cinema[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showsByCinema, setShowsByCinema] = useState<Record<string, ShowDay[]>>({});
  const [showsLoading, setShowsLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!canShow) return;
    let alive = true;
    setDistrictId(-1);
    setAreaId(-1);
    setDistricts([]);
    api
      .moviesCinemaFilters({ cityId })
      .then((r: any) => {
        if (!alive) return;
        if (r && r.ok !== false && Array.isArray(r.districts)) {
          setDistricts(r.districts);
        }
      })
      .catch(() => {
        /* 筛选项失败不挡影院列表 */
      });
    return () => {
      alive = false;
    };
  }, [canShow, cityId]);

  useEffect(() => {
    if (!canShow) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setOpenId(null);
    setShowsByCinema({});
    api
      .moviesCinemas({ movieId, cityId, day, districtId, areaId })
      .then((r: any) => {
        if (!alive) return;
        if (!r || r.ok === false) {
          setCinemas([]);
          setTotal(0);
          setError(mapCinemaReason(r && r.reason));
          return;
        }
        setCinemas(Array.isArray(r.cinemas) ? r.cinemas : []);
        setTotal(typeof r.total === "number" ? r.total : 0);
      })
      .catch((err: any) => {
        if (!alive) return;
        setError((err && err.message) || "排片拉取失败");
        setCinemas([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [canShow, movieId, cityId, day, districtId, areaId]);

  if (!canShow) return null;

  const cityName = city?.name || "当前城市";
  const dayOptions = [
    { value: movieShowDay(0), label: "今天" },
    { value: movieShowDay(1), label: "明天" },
  ];
  const activeDistrict = districts.find((d) => d.id === districtId) || null;
  const areas = activeDistrict?.areas || [];

  const selectDistrict = (id: number) => {
    setDistrictId(id);
    setAreaId(-1);
  };

  const toggleCinema = async (cinema: Cinema) => {
    if (openId === cinema.id) {
      setOpenId(null);
      return;
    }
    setOpenId(cinema.id);
    if (showsByCinema[cinema.id]) return;
    setShowsLoading(cinema.id);
    try {
      const r: any = await api.moviesCinemaShows({
        movieId,
        cinemaId: cinema.id,
        cityId,
        day,
      });
      if (!r || r.ok === false) {
        setShowsByCinema((prev) => ({ ...prev, [cinema.id]: [] }));
        return;
      }
      setShowsByCinema((prev) => ({ ...prev, [cinema.id]: Array.isArray(r.days) ? r.days : [] }));
    } catch {
      setShowsByCinema((prev) => ({ ...prev, [cinema.id]: [] }));
    } finally {
      setShowsLoading(null);
    }
  };

  return (
    <section class="movie-showtimes">
      <div class="movie-showtimes__head">
        <h3>{cityName}排片</h3>
        <div class="movie-showtimes__days">
          {dayOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              class={`movie-showtimes__day${day === opt.value ? " is-active" : ""}`}
              onClick={() => setDay(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <p class="movie-showtimes__hint">数据来自猫眼，票价供参考；购票请打开猫眼。</p>

      {districts.length > 0 && (
        <div class="movie-showtimes__filters" role="group" aria-label="行政区">
          <button
            type="button"
            class={`movie-showtimes__chip${districtId < 0 ? " is-active" : ""}`}
            onClick={() => selectDistrict(-1)}
          >
            全部
          </button>
          {districts.map((d) => (
            <button
              key={d.id}
              type="button"
              class={`movie-showtimes__chip${districtId === d.id ? " is-active" : ""}`}
              onClick={() => selectDistrict(d.id)}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}
      {areas.length > 0 && (
        <div class="movie-showtimes__filters movie-showtimes__filters--areas" role="group" aria-label="商圈">
          <button
            type="button"
            class={`movie-showtimes__chip${areaId < 0 ? " is-active" : ""}`}
            onClick={() => setAreaId(-1)}
          >
            全区
          </button>
          {areas.map((a) => (
            <button
              key={a.id}
              type="button"
              class={`movie-showtimes__chip${areaId === a.id ? " is-active" : ""}`}
              onClick={() => setAreaId(a.id)}
            >
              {a.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div class="movie-showtimes__empty">加载影院…</div>
      ) : error ? (
        <div class="movie-showtimes__empty">{error}</div>
      ) : cinemas.length === 0 ? (
        <div class="movie-showtimes__empty">当天暂无排片影院</div>
      ) : (
        <ul class="movie-showtimes__list">
          {cinemas.map((c) => {
            const open = openId === c.id;
            const days = showsByCinema[c.id];
            const daySlots =
              (days && days.find((d) => d.date === day)) || (days && days[0]) || null;
            return (
              <li class={`movie-showtimes__item${open ? " is-open" : ""}`} key={c.id}>
                <button type="button" class="movie-showtimes__cinema" onClick={() => toggleCinema(c)}>
                  <span class="movie-showtimes__cinema-name">{c.name}</span>
                  <span class="movie-showtimes__cinema-meta">
                    {c.distance && <em>{c.distance}</em>}
                    {c.sellPrice && <em>¥{c.sellPrice} 起</em>}
                    {c.hallTypes?.slice(0, 2).map((h) => (
                      <em key={h}>{h}</em>
                    ))}
                  </span>
                  {c.address && <span class="movie-showtimes__addr">{c.address}</span>}
                </button>
                {open && (
                  <div class="movie-showtimes__panel">
                    {showsLoading === c.id ? (
                      <div class="movie-showtimes__empty">加载场次…</div>
                    ) : !daySlots || daySlots.slots.length === 0 ? (
                      <div class="movie-showtimes__empty">暂无场次</div>
                    ) : (
                      <div class="movie-showtimes__slots">
                        {daySlots.slots.map((s, i) => (
                          <div class="movie-showtimes__slot" key={`${s.time}-${i}`}>
                            <strong>{s.time}</strong>
                            <span>
                              {[s.type, s.lang, s.hall].filter(Boolean).join(" · ")}
                            </span>
                            {s.price && <em>¥{s.price}</em>}
                          </div>
                        ))}
                      </div>
                    )}
                    {c.maoyanUrl && (
                      <button
                        type="button"
                        class="movie-showtimes__open"
                        onClick={() => api.openUrl(c.maoyanUrl!)}
                      >
                        在猫眼查看
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!loading && !error && total > cinemas.length && (
        <p class="movie-showtimes__more">共 {total} 家，仅展示前 {cinemas.length} 家</p>
      )}
    </section>
  );
}

function mapCinemaReason(reason: any): string {
  if (reason === "unsupported_city") return "当前城市不支持排片";
  if (reason === "unsupported_source") return "该片源无排片数据";
  if (reason === "http_timeout") return "网络超时，请重试";
  if (reason === "fetch_failed") return "排片拉取失败";
  return reason || "排片拉取失败";
}

export default CinemaShowtimes;
