
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity irrigation_controller_tb is
end entity;

architecture test of irrigation_controller_tb is

    signal clk           : std_logic := '0';
    signal reset_n       : std_logic := '0';
    signal packet_valid  : std_logic := '0';
    signal soil_moisture : unsigned(7 downto 0) := (others => '0');
    signal pump_enable   : std_logic;

begin

    clk <= not clk after 5 ns;

    process
    begin
        -- Reset
        reset_n <= '0';
        wait for 20 ns;
        reset_n <= '1';

        -- Test 1: Dry soil
        soil_moisture <= to_unsigned(20, 8);
        packet_valid <= '1';
        wait for 20 ns;

        -- Test 2: Normal soil
        soil_moisture <= to_unsigned(50, 8);
        wait for 20 ns;

        -- Test 3: Wet soil
        soil_moisture <= to_unsigned(80, 8);
        wait for 20 ns;

        -- Test 4: Invalid packet
        packet_valid <= '0';
        soil_moisture <= to_unsigned(10, 8);
        wait for 20 ns;

        report "Simulation finished";
        wait;
    end process;

end architecture test;