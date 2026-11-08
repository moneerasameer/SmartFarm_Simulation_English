// ===========================================================================
//  pump_actuator.h - pump actuator model (status monitoring)
//
//  Receives the simulated pump command and models the actuator behaviour:
//    * registers the command (one cycle latency, like a real relay driver)
//    * tracks ON cycles, OFF cycles, activations and total transitions
//
//  It also prints every state change, so the transcript shows exactly when the
//  simulated pump starts and stops. No physical pump, relay or valve exists in
//  this project - 'running' is a simulation variable.
// ===========================================================================
#ifndef SMART_FARM_PUMP_ACTUATOR_H
#define SMART_FARM_PUMP_ACTUATOR_H

#include <systemc>
#include <cstdio>

namespace smartfarm {

class PumpActuator : public sc_core::sc_module {
public:
    SC_HAS_PROCESS(PumpActuator);           // custom constructor -> SC_METHOD needs this
    // Ports -----------------------------------------------------------------
    sc_core::sc_in<bool>  clk{"clk"};
    sc_core::sc_in<bool>  pump_cmd{"pump_cmd"};
    sc_core::sc_out<bool> running{"running"};

    // Statistics ------------------------------------------------------------
    unsigned on_cycles = 0;
    unsigned off_cycles = 0;
    unsigned start_count = 0;

    PumpActuator(sc_core::sc_module_name name_, const char* label_)
        : sc_core::sc_module(name_),
          label(label_),
          is_running(false) {
        SC_METHOD(actuate);
        sensitive << clk.pos();
        dont_initialize();
    }

private:
    const char* label;
    bool is_running;

    void actuate() {
        const bool cmd = pump_cmd.read();

        if (cmd != is_running) {
            is_running = cmd;
            if (is_running) {
                ++start_count;
            }
            std::printf("[%8s] pump/%-9s: %s\n",
                        sc_core::sc_time_stamp().to_string().c_str(),
                        label, is_running ? "START (ON)" : "STOP  (OFF)");
        }

        running.write(is_running);
        if (is_running) {
            ++on_cycles;
        } else {
            ++off_cycles;
        }
    }
};

}  // namespace smartfarm

#endif  // SMART_FARM_PUMP_ACTUATOR_H
