/**
 * Запись цветов двух верхних полосок в ОБЩЕЕ хранилище Zepp OS (API_LEVEL 3.0+), откуда их читает циферблат Luv Face (его shared/top.js).
 * Циферблат читает так: TypedStorage(1061613, 'u613stat') — ints c0…c5 и int64 at; LocalStorage(1061613, 'u613stat.json') — { top: [6 цветов], at }.
 * Имена обязаны совпадать с циферблатом (STAT_APP_ID, SCOPE, FILE там и здесь одинаковые).
 *
 * Классы хранилища передаются снаружи (api = { TypedStorage, LocalStorage } из '@zos/share-storage'; в тестах — заглушки), поэтому здесь нет обращений к API часов.
 * Как именно у конкретной прошивки пишется в общее хранилище, заранее не известно (ни одной проверки на живых часах у нас нет), поэтому запись пробует
 * несколько вариантов вызова (с номером приложения и без) и после записи перечитывает так же, как читает циферблат. Что вышло — в результате (и в диагностике приложения).
 */
export const STAT_APP_ID = 1061613   // appId этого приложения (app.json)
export const SCOPE = 'u613stat'      // группа TypedStorage
export const FILE = 'u613stat.json'  // файл LocalStorage
export const COUNT = 6

/** Шесть цветов для циферблата из 8 × 3 цветов приложения: полоска 0 (слова) и полоска 1 (все занятия): месяц, неделя, день. Нет данных — null. */
export function topSix(colors) {
  if (!colors || colors.length < 2 || !colors[0] || !colors[1]) return null
  const out = [].concat(colors[0].slice(0, 3), colors[1].slice(0, 3))
  if (out.length !== COUNT) return null
  for (let i = 0; i < COUNT; i++) if (typeof out[i] !== 'number') return null
  return out
}

function call(f) { try { f() } catch (e) { /* не критично */ } }

/**
 * Записать шесть цветов и время записи at (мс). Возвращает { ok, verified, wrote, errs }:
 *  ok — хоть одна запись прошла без ошибки; verified — перечитанное совпало с записанным; wrote — сколько записей прошло; errs — что не вышло.
 */
export function writeTop(api, six, at) {
  const res = { ok: false, verified: false, wrote: 0, errs: '' }
  if (!api || !six || six.length !== COUNT) { res.errs = 'нечего писать'; return res }
  const typedArgs = [[SCOPE], [STAT_APP_ID, SCOPE]]
  const fileArgs = [[FILE], [STAT_APP_ID, FILE]]
  for (let v = 0; v < typedArgs.length; v++) {
    try {
      const s = new api.TypedStorage(...typedArgs[v])
      for (let i = 0; i < COUNT; i++) s.setInt('c' + i, six[i])
      s.setInt64('at', at)
      call(() => { if (typeof s.flush === 'function') s.flush() })
      call(() => { if (typeof s.save === 'function') s.save() })
      res.wrote++
    } catch (e) { res.errs += 'typed' + v + ': ' + String(e).slice(0, 40) + ' ' }
  }
  for (let v = 0; v < fileArgs.length; v++) {
    try {
      const f = new api.LocalStorage(...fileArgs[v])
      f.setItem('top', six)
      f.setItem('at', at)
      call(() => { if (typeof f.flush === 'function') f.flush() })
      call(() => { if (typeof f.save === 'function') f.save() })
      res.wrote++
    } catch (e) { res.errs += 'file' + v + ': ' + String(e).slice(0, 40) + ' ' }
  }
  res.ok = res.wrote > 0
  // проверка: читаем так же, как циферблат (с номером приложения)
  try {
    const t = new api.TypedStorage(STAT_APP_ID, SCOPE)
    if (+t.getInt64('at', 0) === at && t.getInt('c0', -1) === six[0]) res.verified = true
  } catch (e) { /* не вышло — проверим файл */ }
  if (!res.verified) {
    try {
      const f = new api.LocalStorage(STAT_APP_ID, FILE)
      if (+f.getItem('at', 0) === at) res.verified = true
    } catch (e) { /* проверить нечем */ }
  }
  return res
}

/** Короткая строка для диагностики. */
export function describe(res) {
  if (!res) return 'ещё не писали'
  if (!res.ok) return 'ОШИБКА — ' + (res.errs || 'не записалось')
  return (res.verified ? 'записано, перечитано' : 'записано, проверить нечем') + (res.errs ? ' (' + res.errs.trim() + ')' : '')
}
