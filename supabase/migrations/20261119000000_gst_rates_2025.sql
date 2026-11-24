-- =====================================================================
-- GST rates after GST 2.0 (22 Sep 2025), for new products' defaults:
--   * solar inverters / PCUs and solar charge controllers are "renewable energy devices": 5%
--   * batteries (8507) 18% (cut from 28%), inverters / UPS / stabilizers (8504) 18%,
--     solar panels (8541) 5% - already the defaults.
-- Existing products keep whatever rate is set on them (changed separately, per product).
-- =====================================================================

update public.categories set default_gst_rate_pct = 5.00
where name in ('Solar inverter / PCU', 'Charge controller');
