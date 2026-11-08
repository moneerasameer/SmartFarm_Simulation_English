// ===========================================================================
//  irrigation_controller.h - automatic irrigation controller (decision logic)
//
//  Documented control law (identical to vhdl/irrigation_controller.vhd and to
//  matlab/functions/irrigation_control.m):
//
//      soil <  DRY_THRESHOLD                -> pump ON
//      soil >  WET_THRESHOLD                -> pump OFF
//      inside the hysteresis band           -> previous state is kept
//      no valid telemetry                   -> previous state is kept ("hold")
//      no valid telemetry (fail-safe mode)  -> after kMaxHoldSamples consecutive
//                                              missing packets the pump is forced
//                                              OFF (watchdog)
//
//  The module is registered (one clock cycle latency), like the VHDL RTL.
//  It drives a SIMULATED pump command only; no physical actuator exists.
// ===========================================================================
#ifndef SMART_FARM_IRRIGATION_CONTROLLER_H
#define SMART_FARM_IRRIGATION_CONTROLLER_H

#include <systemc>
#include <cstdio>

#include "smart_farm_types.h"

namespace smartfarm {

class IrrigationController : public sc_core::sc_module {
public:
    SC_HAS_PROCESS(IrrigationController);   // custom constructor -> SC_METHOD needs this
    // Ports -----------------------------------------------------------------
    sc_core::sc_in<bool>      clk{"clk"};
    sc_core::sc_in<unsigned>  soil{"soil"};                 // from the gateway
    sc_core::sc_in<bool>      packet_ready{"packet_ready"}; // 'valid' flag
    sc_core::sc_out<bool>     pump_cmd{"pump_cmd"};

    // Configuration ---------------------------------------------------------
    const bool     fail_safe;      // false = hold, true = watchdog fail-safe
    const unsigned max_hold;       // consecutive losses before the watchdog trips
    const char*    policy_name;

    // Statistics ------------------------------------------------------------
    unsigned on_cycles = 0;
    unsigned transitions = 0;
    unsigned activations = 0;
    unsigned watchdog_trips = 0;

    IrrigationController(sc_core::sc_module_name name_,
                         bool fail_safe_,
                         unsigned max_hold_ = kMaxHoldSamples)
        : sc_core::sc_module(name_),
          fail_safe(fail_safe_),
          max_hold(max_hold_),
          policy_name(fail_safe_ ? "fail-safe" : "hold     "),
          pump_state(false),
          last_cmd(false),
          consecutive_losses(0u) {
        SC_METHOD(control);
        sensitive << clk.pos();
        dont_initialize();
    }

private:
    bool     pump_state;
    bool     last_cmd;
    unsigned consecutive_losses;

    void control() {
        const bool valid = packet_ready.read();
        const char* reason = "";

        if (valid) {
            consecutive_losses = 0;
            const unsigned soil_pct = soil.read();

            if (soil_pct < kDryThreshold) {
                pump_state = true;
                reason = "irrigate (soil below dry threshold)";
            } else if (soil_pct > kWetThreshold) {
                pump_state = false;
                reason = "stop (soil above wet threshold)";
            } else {
                reason = "hold (inside hysteresis band)";
            }
        } else {
            ++consecutive_losses;
            if (fail_safe && consecutive_losses >= max_hold) {
                if (pump_state) {
                    ++watchdog_trips;
                }
                pump_state = false;
                reason = "fail-safe watchdog: pump OFF";
            } else {
                reason = "hold (no telemetry)";
            }
        }

        pump_cmd.write(pump_state);

        if (pump_state) {
            ++on_cycles;
        }
        if (pump_state != last_cmd) {
            ++transitions;
            if (pump_state) {
                ++activations;
            }
            std::printf("[%8s] ctrl/%-9s: pump %s   (%s)\n",
                        sc_core::sc_time_stamp().to_string().c_str(),
                        policy_name, pump_state ? "ON " : "OFF", reason);
        }
        last_cmd = pump_state;
    }
};

}  // namespace smartfarm

#endif  // SMART_FARM_IRRIGATION_CONTROLLER_H
