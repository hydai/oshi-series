/**
 * 寫入記憶體快取，超過上限時先刪掉最舊的一筆。
 * 快取只存在記憶體裡，服務重新啟動（或休眠後被喚醒）就會清空。
 */
const setWithLimit = (map, key, value, maxSize = 200) => {
    if (map.size >= maxSize) {
        map.delete(map.keys().next().value)
    }
    map.set(key, value)
}

module.exports = { setWithLimit }
