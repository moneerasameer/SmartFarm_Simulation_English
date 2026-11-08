--------------------------------------------------------------------------------
-- Smart Farm - digital irrigation controller (synthesizable RTL)
--
-- Inputs
--   clk            system clock
--   reset_n        asynchronous active-low reset -> pump OFF (safe state)
--   packet_valid   '1' when a sensor packet was received over the (simulated)
--                  LoRa link, '0' when the telemetry is missing
--   soil_moisture  unsigned 8-bit soil moisture in percent (0..100)
--
-- Output
--   pump_enable    simulated pump command: '1' = irrigate, '0' = stop
--
-- CONFIGURABLE BEHAVIOUR (generics)
--   HYSTERESIS_ENABLE = true (default, documented project law)
--       soil <  DRY_THRESHOLD   -> pump ON
--       soil >  WET_THRESHOLD   -> pump OFF
--       band (DRY..WET)         -> keep the previous state (hysteresis)
--   HYSTERESIS_ENABLE = false (single threshold)
--       soil <  DRY_THRESHOLD   -> pump ON
--       soil >= DRY_THRESHOLD   -> pump OFF
--
--   FAILSAFE_ON_LOSS = false (default, documented project law)
--       no valid sample         -> keep the previous state ("hold")
--   FAILSAFE_ON_LOSS = true (fail-safe)
--       no valid sample         -> pump OFF (defined safe state)
--
-- A sample is VALID when packet_valid = '1' AND soil_moisture <= 100.
-- A value above 100 % is physically impossible, so it is treated exactly like a
-- lost packet instead of driving the actuator with corrupt data.
--
-- IMPORTANT: this is a simulation model of the control logic. The project does
-- not drive a physical pump with this code.
--------------------------------------------------------------------------------
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity irrigation_controller is
    generic (
        DRY_THRESHOLD     : integer := 30;    -- irrigation starts below this value
        WET_THRESHOLD     : integer := 40;    -- irrigation stops above this value
        HYSTERESIS_ENABLE : boolean := true;  -- false -> single threshold
        FAILSAFE_ON_LOSS  : boolean := false  -- true  -> pump OFF when data is missing
    );
    port (
        clk           : in  std_logic;
        reset_n       : in  std_logic;
        packet_valid  : in  std_logic;
        soil_moisture : in  unsigned(7 downto 0);
        pump_enable   : out std_logic
    );
end entity irrigation_controller;

architecture rtl of irrigation_controller is

    -- Largest physically meaningful soil-moisture value (percent).
    constant SOIL_MAX_PERCENT : integer := 100;

    -- Registered pump command, initialised to the safe state.
    signal pump_state : std_logic := '0';

    -- True only when the current input pair carries a trustworthy measurement.
    signal sample_ok : boolean;

begin

    -- Guard against an inconsistent generic configuration (checked at elaboration).
    assert WET_THRESHOLD > DRY_THRESHOLD
        report "irrigation_controller: WET_THRESHOLD must be greater than DRY_THRESHOLD"
        severity failure;

    sample_ok <= (packet_valid = '1') and (to_integer(soil_moisture) <= SOIL_MAX_PERCENT);

    ----------------------------------------------------------------------------
    -- Control state machine (single clock domain, asynchronous reset).
    ----------------------------------------------------------------------------
    control : process (clk, reset_n)
        variable moisture : integer;
    begin
        if reset_n = '0' then
            pump_state <= '0';                      -- safe state on reset

        elsif rising_edge(clk) then
            if sample_ok then
                moisture := to_integer(soil_moisture);

                if moisture < DRY_THRESHOLD then
                    pump_state <= '1';              -- soil too dry -> irrigate

                elsif HYSTERESIS_ENABLE then
                    -- Documented law: stop only when strictly above the wet
                    -- threshold; inside the band the previous state is kept.
                    if moisture > WET_THRESHOLD then
                        pump_state <= '0';
                    end if;

                else
                    -- Single-threshold law: any value >= DRY stops the pump.
                    pump_state <= '0';
                end if;

            elsif FAILSAFE_ON_LOSS then
                pump_state <= '0';                  -- no telemetry -> safe state
            end if;
            -- FAILSAFE_ON_LOSS = false: previous state is kept ("hold")
        end if;
    end process control;

    pump_enable <= pump_state;

end architecture rtl;
