/**
 * src/main/ipc/register-food.js
 *
 * 附近美食 IPC handlers (v2.26+).
 */

const { fetchNearbyFood } = require("../food/index");
const { hasAmapKey, setAmapKey } = require("../food/food-config");

function registerFoodHandlers(ctx) {
  const { safeHandle } = ctx;

  safeHandle("food:fetch-nearby", async (_evt, payload) => {
    return fetchNearbyFood(payload || {});
  });

  safeHandle("food:get-config", async () => {
    const has = await hasAmapKey();
    return { hasAmapKey: has };
  });

  safeHandle("food:save-config", async (_evt, payload) => {
    const key = payload && payload.amapKey;
    return setAmapKey(key);
  });
}

module.exports = { registerFoodHandlers };
