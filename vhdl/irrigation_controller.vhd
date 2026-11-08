library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

-- Digital irrigation controller.
-- soil_moisture is an unsigned 8-bit percentage (0..100).
-- packet_valid indicates that a sensor update was successfully received.
entity irrigation_controller is
    port (
        clk           : in  std_logic;
        reset_n       : in  std_logic;
        packet_valid  : in  std_logic;
        soil_moisture : in  unsigned(7 downto 0);
        pump_enable   : out std_logic
    );
end entity;

architecture rtl of irrigation_controller is
    signal pump_state : std_logic := '0';
    constant DRY_LIMIT : unsigned(7 downto 0) := to_unsigned(30, 8);
    constant WET_LIMIT : unsigned(7 downto 0) := to_unsigned(40, 8);
begin
    process(clk, reset_n)
    begin
        if reset_n = '0' then
            pump_state <= '0';
        elsif rising_edge(clk) then
            if packet_valid = '1' then
                if soil_moisture < DRY_LIMIT then
                    pump_state <= '1';
                elsif soil_moisture > WET_LIMIT then
                    pump_state <= '0';
                end if;
            end if;
        end if;
    end process;
    pump_enable <= pump_state;
end architecture;
