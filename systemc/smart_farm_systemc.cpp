#include <systemc>
#include <iostream>

using namespace sc_core;

// Simplified SystemC model of sensors -> virtual LoRa link -> irrigation control.
// All data are synthetic. This is not a physical LoRa radio implementation.
SC_MODULE(SmartFarm) {
    sc_in<bool> clk;
    sc_out<bool> pump;
    sc_signal<unsigned> soil;
    sc_signal<bool> packet_valid;

    void sensor_and_link() {
        unsigned sample = 0;
        while (true) {
            unsigned moisture = 45;
            if (sample % 40 < 12) moisture = 24 + (sample % 12);
            else if (sample % 40 < 25) moisture = 33 + (sample % 10);
            else moisture = 42 + (sample % 8);
            soil.write(moisture);
            packet_valid.write((sample % 17) != 0); // deterministic packet loss
            wait();
            ++sample;
        }
    }

    void irrigation_logic() {
        bool pump_state = false;
        while (true) {
            wait();
            if (packet_valid.read()) {
                if (soil.read() < 30) pump_state = true;
                else if (soil.read() > 40) pump_state = false;
            }
            pump.write(pump_state);
            std::cout << sc_time_stamp() << " | soil=" << soil.read()
                      << "% | packet=" << packet_valid.read()
                      << " | pump=" << pump_state << std::endl;
        }
    }

    SC_CTOR(SmartFarm) {
        SC_THREAD(sensor_and_link);
        sensitive << clk.pos();
        SC_THREAD(irrigation_logic);
        sensitive << clk.pos();
    }
};

int sc_main(int argc, char* argv[]) {
    sc_clock clk("clk", 1, SC_SEC);
    sc_signal<bool> pump;
    SmartFarm farm("farm");
    farm.clk(clk);
    farm.pump(pump);
    sc_start(30, SC_SEC);
    return 0;
}
