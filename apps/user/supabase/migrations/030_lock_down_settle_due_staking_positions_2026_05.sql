REVOKE ALL ON FUNCTION public.settle_due_staking_positions(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_due_staking_positions(integer) FROM anon;
REVOKE ALL ON FUNCTION public.settle_due_staking_positions(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.settle_due_staking_positions(integer) TO service_role;
