--------------------------------------------------------------------------------
-- Smart Farm - self-checking testbench for the irrigation controller
--
-- The same stimulus is applied to THREE instances of the design under test, so
-- every functional requirement is verified against the configuration that
-- implements it:
--
--   dut_hold      HYSTERESIS=true , FAILSAFE=false   documented project law
--                                                    (hysteresis + hold on loss)
--   dut_failsafe  HYSTERESIS=true , FAILSAFE=true    documented law + fail-safe
--                                                    OFF when telemetry is lost
--   dut_strict    HYSTERESIS=false, FAILSAFE=true    single threshold + safe
--                                                    state OFF (strict reading of
--                                                    requirements 2 and 3)
--
-- Every check is an explicit assertion implemented by the CHECK procedure, which
-- counts passes and failures. At the end the testbench prints a summary and
-- calls std.env.finish, so the simulation terminates by itself and returns a
-- meaningful exit code (0 = all checks passed, 1 = at least one failure).
--
-- Test cases covered
--   1  asynchronous reset                              (safe state OFF)
--   2  dry soil + telemetry   -> pump ON
--   3  hysteresis band        -> hold (or OFF for the single-threshold variant)
--   4  wet soil               -> pump OFF
--   5  communication failure  -> hold / fail-safe OFF
--   6  exact threshold values (29, 30, 40, 41, 100)
--   7  out-of-range samples (> 100 %) treated as invalid
--   8  repeatability (identical stimulus -> identical output)
--
-- Language: VHDL-2008 (std.env.finish, boolean generics, local procedures).
-- Simulator: GHDL 5.1.1 (--std=08).
--------------------------------------------------------------------------------
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity irrigation_controller_tb is
end entity irrigation_controller_tb;

architecture sim of irrigation_controller_tb is

    constant CLK_PERIOD : time := 10 ns;

    -- Thresholds used by the three instances (percent).
    constant DRY : integer := 30;
    constant WET : integer := 40;

    signal clk           : std_logic := '0';
    signal reset_n       : std_logic := '0';
    signal packet_valid  : std_logic := '0';
    signal soil_moisture : unsigned(7 downto 0) := (others => '0');

    signal pump_hold     : std_logic;
    signal pump_failsafe : std_logic;
    signal pump_strict   : std_logic;

begin

    ----------------------------------------------------------------------------
    -- Clock generation
    ----------------------------------------------------------------------------
    clock_driver : process
    begin
        clk <= '0';
        wait for CLK_PERIOD / 2;
        clk <= '1';
        wait for CLK_PERIOD / 2;
    end process clock_driver;

    ----------------------------------------------------------------------------
    -- Design under test 1: documented law (hysteresis + hold on loss)
    ----------------------------------------------------------------------------
    dut_hold : entity work.irrigation_controller
        generic map (
            DRY_THRESHOLD     => DRY,
            WET_THRESHOLD     => WET,
            HYSTERESIS_ENABLE => true,
            FAILSAFE_ON_LOSS  => false
        )
        port map (
            clk           => clk,
            reset_n       => reset_n,
            packet_valid  => packet_valid,
            soil_moisture => soil_moisture,
            pump_enable   => pump_hold
        );

    ----------------------------------------------------------------------------
    -- Design under test 2: documented law + fail-safe OFF on loss
    ----------------------------------------------------------------------------
    dut_failsafe : entity work.irrigation_controller
        generic map (
            DRY_THRESHOLD     => DRY,
            WET_THRESHOLD     => WET,
            HYSTERESIS_ENABLE => true,
            FAILSAFE_ON_LOSS  => true
        )
        port map (
            clk           => clk,
            reset_n       => reset_n,
            packet_valid  => packet_valid,
            soil_moisture => soil_moisture,
            pump_enable   => pump_failsafe
        );

    ----------------------------------------------------------------------------
    -- Design under test 3: single threshold + fail-safe OFF on loss
    ----------------------------------------------------------------------------
    dut_strict : entity work.irrigation_controller
        generic map (
            DRY_THRESHOLD     => DRY,
            WET_THRESHOLD     => WET,
            HYSTERESIS_ENABLE => false,
            FAILSAFE_ON_LOSS  => true
        )
        port map (
            clk           => clk,
            reset_n       => reset_n,
            packet_valid  => packet_valid,
            soil_moisture => soil_moisture,
            pump_enable   => pump_strict
        );

    ----------------------------------------------------------------------------
    -- Stimulus, checking and reporting
    ----------------------------------------------------------------------------
    stimulus : process
        variable checks   : natural := 0;
        variable failures : natural := 0;

        ------------------------------------------------------------------------
        -- Assertion helper: compares one DUT output with the expected value.
        ------------------------------------------------------------------------
        procedure check (
            signal   actual   : in std_logic;
            constant expected : in std_logic;
            constant name     : in string
        ) is
        begin
            checks := checks + 1;
            if actual = expected then
                report "PASS | " & name & " -> " & std_logic'image(actual)
                    severity note;
            else
                failures := failures + 1;
                report "FAIL | " & name &
                       " | expected " & std_logic'image(expected) &
                       " but got " & std_logic'image(actual)
                    severity warning;
            end if;
        end procedure check;

        ------------------------------------------------------------------------
        -- Apply one sensor sample, clock it in, then verify all three DUTs.
        ------------------------------------------------------------------------
        procedure step (
            constant sample       : in integer;
            constant valid        : in std_logic;
            constant exp_hold     : in std_logic;
            constant exp_failsafe : in std_logic;
            constant exp_strict   : in std_logic;
            constant name         : in string
        ) is
        begin
            soil_moisture <= to_unsigned(sample, 8);
            packet_valid  <= valid;
            wait until rising_edge(clk);
            wait for 1 ns;                     -- let the output assignment settle
            check(pump_hold,     exp_hold,     "hold     | " & name);
            check(pump_failsafe, exp_failsafe, "failsafe | " & name);
            check(pump_strict,   exp_strict,   "strict   | " & name);
        end procedure step;

    begin
        ------------------------------------------------------------------------
        report "==== irrigation_controller_tb: start ====" severity note;

        -- 1. Asynchronous reset ------------------------------------------------
        reset_n       <= '0';
        packet_valid  <= '0';
        soil_moisture <= to_unsigned(0, 8);
        wait for 3 * CLK_PERIOD;
        check(pump_hold,     '0', "reset | hold output is OFF");
        check(pump_failsafe, '0', "reset | failsafe output is OFF");
        check(pump_strict,   '0', "reset | strict output is OFF");
        reset_n <= '1';
        wait until rising_edge(clk);
        wait for 1 ns;


        -- 2. Dry soil, telemetry available -> pump ON (requirement 1) ---------
        step(20, '1', '1', '1', '1', "dry soil 20 % + telemetry");

        -- 3. Hysteresis band -> hold; single threshold -> OFF (requirement 2) -
        step(35, '1', '1', '1', '0', "band 35 % + telemetry");

        -- 4. Wet soil -> pump OFF ---------------------------------------------
        step(45, '1', '0', '0', '0', "wet soil 45 % + telemetry");

        -- 5. Band again, now starting from OFF -> stays OFF --------------------
        step(35, '1', '0', '0', '0', "band 35 % after stop");

        -- 6. Communication lost while the pump is OFF -> stays OFF ------------
        step(20, '0', '0', '0', '0', "loss of telemetry while OFF");

        -- 7. Telemetry restored, dry -> pump ON -------------------------------
        step(20, '1', '1', '1', '1', "telemetry restored, dry soil");

        -- 8. Communication lost while the pump is ON (requirement 3) ----------
        --    documented law holds the state, fail-safe variants switch OFF
        step(20, '0', '1', '0', '0', "loss of telemetry while ON");

        -- 9. Telemetry restored again -----------------------------------------
        step(20, '1', '1', '1', '1', "telemetry restored again");

        -- 10. Exact dry threshold (30 %): not < 30 -> hold / OFF --------------
        step(30, '1', '1', '1', '0', "exact dry threshold 30 %");

        -- 11. Just below the dry threshold (29 %) -----------------------------
        step(29, '1', '1', '1', '1', "just below dry threshold 29 %");

        -- 12. Exact wet threshold (40 %): not > 40 -> hold / OFF --------------
        step(40, '1', '1', '1', '0', "exact wet threshold 40 %");

        -- 13. Just above the wet threshold (41 %) -----------------------------
        step(41, '1', '0', '0', '0', "just above wet threshold 41 %");

        -- 14. Dry again -------------------------------------------------------
        step(20, '1', '1', '1', '1', "dry soil again");

        -- 15. Out-of-range sample (150 %) is invalid -> hold / fail-safe OFF --
        step(150, '1', '1', '0', '0', "out-of-range sample 150 %");

        -- 16. Recover with a valid dry sample ---------------------------------
        step(20, '1', '1', '1', '1', "recovered with valid sample");

        -- 17. Maximum valid value (100 %) is a wet reading --------------------
        step(100, '1', '0', '0', '0', "maximum valid sample 100 %");

        -- 18. 101 % is not a valid percentage -> invalid ----------------------
        step(101, '1', '0', '0', '0', "invalid sample 101 %");

        -- 19. Repeatability: identical stimulus must give identical output ----
        step(20, '1', '1', '1', '1', "repeat 1/3 dry soil");
        step(20, '1', '1', '1', '1', "repeat 2/3 dry soil");
        step(20, '1', '1', '1', '1', "repeat 3/3 dry soil");

        -- 20. Asynchronous reset in the middle of operation -------------------
        reset_n <= '0';
        wait for 1 ns;                         -- intentionally no clock edge
        check(pump_hold,     '0', "async reset without clock edge | hold");
        check(pump_failsafe, '0', "async reset without clock edge | failsafe");
        check(pump_strict,   '0', "async reset without clock edge | strict");
        reset_n <= '1';
        wait until rising_edge(clk);
        wait for 1 ns;

        -- 21. After reset the controller starts again from OFF ---------------
        step(20, '1', '1', '1', '1', "after async reset, dry soil -> ON");

        ------------------------------------------------------------------------
        -- Summary and termination
        ------------------------------------------------------------------------
        report "==== irrigation_controller_tb: " &
               integer'image(checks) & " checks, " &
               integer'image(failures) & " failure(s) ====" severity note;

        if failures = 0 then
            report "RESULT: PASS" severity note;
            std.env.finish(0);
        else
            report "RESULT: FAIL" severity failure;
            std.env.finish(1);
        end if;

        wait;
    end process stimulus;

end architecture sim;

