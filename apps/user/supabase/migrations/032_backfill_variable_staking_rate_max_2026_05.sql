UPDATE public.staking_products
   SET settlement_rate_max = ROUND(annual_rate * 200, 4)
 WHERE product_type = 'variable'
   AND settlement_rate_min = ROUND(annual_rate * 100, 4)
   AND settlement_rate_max = ROUND(annual_rate * 100, 4);
