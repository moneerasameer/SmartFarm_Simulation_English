// ===========================================================================
//  smart_farm_tb.h - top-level testbench: architecture wiring + stimulus
//
//  Data flow (all connections are real sc_signal wires):
//
//   step_index ─┬─> SensorMonitor ──soil──> LoRaLink ──soil_out/ready──┬─> SoilMoistureProcessor ──> zone/valid
//   link_ok ────┘                                  │                  │
//                                                  │                  └─> IrrigationController (hold)     ──> PumpActuator
//                                                  └────────────────────> IrrigationController (fail-safe) ──> PumpActuator
//
//  The stimulus walks through the scripted scenarios in smart_farm_types.h and
//  checks the simulated pump state of BOTH controller policies against the
//  expected values, so the testbench is self-checking.
// ===========================================================================
#ifndef SMART_FARM_TB_H
#define SMART_FARM_TB_H

#include <systemc>
#include <cstdio>

#include "smart_farm_types.h"
#include "sensor_monitor.h"
#include "lora_link.h"
#include "soil_moisture_processor.h"
#include "irrigation_controller.h"
#include "pump_actuator.h"

namespace smartfarm {

class SmartFarmTB : public sc_core::sc_module {
public:
    // Clock: one cycle = one sensor reporting interval -----------------------
    sc_core::sc_clock clk;

    // Testbench-driven stimulus --------------------------------------------
    sc_core::sc_signal<unsigned> step_sig{"step_sig"};
    sc_core::sc_signal<bool>     link_sig{"link_sig"};

    // Datapath wires --------------------------------------------------------
    sc_core::sc_signal<unsigned> soil_node_s{"soil_node_s"};
    sc_core::sc_signal<bool>     sample_ready_s{"sample_ready_s"};
    sc_core::sc_signal<double>   temperature_s{"temperature_s"};
    sc_core::sc_signal<double>   humidity_s{"humidity_s"};
    sc_core::sc_signal<unsigned> soil_gw_s{"soil_gw_s"};
    sc_core::sc_signal<bool>     ready_s{"ready_s"};
    sc_core::sc_signal<unsigned> zone_s{"zone_s"};
    sc_core::sc_signal<bool>     valid_s{"valid_s"};
    sc_core::sc_signal<bool>     cmd_hold_s{"cmd_hold_s"};
    sc_core::sc_signal<bool>     cmd_failsafe_s{"cmd_failsafe_s"};
    sc_core::sc_signal<bool>     pump_hold_s{"pump_hold_s"};
    sc_core::sc_signal<bool>     pump_failsafe_s{"pump_failsafe_s"};

    // Modules ---------------------------------------------------------------
    SensorMonitor         sensor{"sensor"};
    LoRaLink              link{"link"};
    SoilMoistureProcessor processor{"processor"};
    IrrigationController  ctrl_hold{"ctrl_hold", false};
    IrrigationController  ctrl_failsafe{"ctrl_failsafe", true};
    PumpActuator          pump_hold{"pump_hold", "hold"};
    PumpActuator          pump_failsafe{"pump_failsafe", "fail-safe"};

    // Test results ----------------------------------------------------------
    unsigned checks = 0;
    unsigned failures = 0;
    bool     finished = false;

    SC_CTOR(SmartFarmTB)
        : clk("clk", sc_core::sc_time(kClockPeriodSeconds, sc_core::SC_SEC)) {

        // --- bind the datapath ---------------------------------------------
        sensor.clk(clk);
        sensor.step_index(step_sig);
        sensor.soil_moisture(soil_node_s);
        sensor.sample_ready(sample_ready_s);
        sensor.air_temperature(temperature_s);
        sensor.air_humidity(humidity_s);

        link.clk(clk);
        link.link_ok(link_sig);
        link.sample_ready(sample_ready_s);
        link.soil_in(soil_node_s);
        link.soil_out(soil_gw_s);
        link.packet_ready(ready_s);

        processor.clk(clk);
        processor.soil_in(soil_gw_s);
        processor.packet_ready(ready_s);
        processor.zone(zone_s);
        processor.valid(valid_s);

        ctrl_hold.clk(clk);
        ctrl_hold.soil(soil_gw_s);
        ctrl_hold.packet_ready(ready_s);
        ctrl_hold.pump_cmd(cmd_hold_s);

        ctrl_failsafe.clk(clk);
        ctrl_failsafe.soil(soil_gw_s);
        ctrl_failsafe.packet_ready(ready_s);
        ctrl_failsafe.pump_cmd(cmd_failsafe_s);

        pump_hold.clk(clk);
        pump_hold.pump_cmd(cmd_hold_s);
        pump_hold.running(pump_hold_s);

        pump_failsafe.clk(clk);
        pump_failsafe.pump_cmd(cmd_failsafe_s);
        pump_failsafe.running(pump_failsafe_s);

        SC_THREAD(stimulus);
    }

private:
    // --- assertion helper --------------------------------------------------
    void check(const char* what, bool actual, bool expected) {
        ++checks;
        if (actual == expected) {
            std::printf("  CHECK PASS | %-34s expected=%d actual=%d\n",
                        what, static_cast<int>(expected), static_cast<int>(actual));
        } else {
            ++failures;
            std::printf("  CHECK FAIL | %-34s expected=%d actual=%d\n",
                        what, static_cast<int>(expected), static_cast<int>(actual));
        }
    }

    void wait_cycles(unsigned cycles) {
        for (unsigned i = 0; i < cycles; ++i) {
            wait(clk.negedge_event());
        }
    }

    // --- stimulus ----------------------------------------------------------
    void stimulus() {
        // Align with the clock and start from a defined state.
        step_sig.write(0u);
        link_sig.write(true);
        wait(clk.negedge_event());

        std::printf("\n--- scenario: %u steps x %u cycles ---\n",
                    static_cast<unsigned>(kScenarioSteps), kSettleCycles);

        for (std::size_t s = 0; s < kScenarioSteps; ++s) {
            const Step& step = kScenario[s];

            step_sig.write(static_cast<unsigned>(s));
            link_sig.write(step.packet_ok);

            std::printf("\n[step %u] %s   (link %s)\n",
                        static_cast<unsigned>(s + 1u), step.label,
                        step.packet_ok ? "OK" : "DOWN");

            wait_cycles(kSettleCycles);

            const bool hold_on = pump_hold_s.read();
            const bool safe_on = pump_failsafe_s.read();

            std::printf("  settled: pump hold=%s  fail-safe=%s  zone=%s valid=%d\n",
                        hold_on ? "ON " : "OFF", safe_on ? "ON " : "OFF",
                        zone_name(zone_s.read()), static_cast<int>(valid_s.read()));

            char label[96];
            std::snprintf(label, sizeof(label), "step %u hold pump",
                          static_cast<unsigned>(s + 1u));
            check(label, hold_on, step.expect_hold);

            std::snprintf(label, sizeof(label), "step %u fail-safe pump",
                          static_cast<unsigned>(s + 1u));
            check(label, safe_on, step.expect_failsafe);
        }

        report();
        finished = true;
        sc_core::sc_stop();
    }

    void report() const {
        std::printf("\n==============================================================\n");
        std::printf(" SIMULATION SUMMARY\n");
        std::printf("==============================================================\n");
        std::printf(" simulated time          : %s\n",
                    sc_core::sc_time_stamp().to_string().c_str());
        std::printf(" sensor samples          : %u\n", sensor.samples_taken);
        std::printf(" packets sent/delivered  : %u / %u\n",
                    link.packets_sent, link.packets_delivered);
        std::printf(" packets lost            : %u  (longest outage %u cycles)\n",
                    link.packets_lost, link.longest_outage);
        std::printf(" valid / invalid samples : %u / %u\n",
                    processor.valid_samples, processor.invalid_samples);
        std::printf(" controller 'hold'       : ON %u cycles, %u activation(s), %u trip(s)\n",
                    ctrl_hold.on_cycles, ctrl_hold.activations, ctrl_hold.watchdog_trips);
        std::printf(" controller 'fail-safe'  : ON %u cycles, %u activation(s), %u trip(s)\n",
                    ctrl_failsafe.on_cycles, ctrl_failsafe.activations,
                    ctrl_failsafe.watchdog_trips);
        std::printf(" pump 'hold'             : ON %u / OFF %u cycles, %u start(s)\n",
                    pump_hold.on_cycles, pump_hold.off_cycles, pump_hold.start_count);
        std::printf(" pump 'fail-safe'        : ON %u / OFF %u cycles, %u start(s)\n",
                    pump_failsafe.on_cycles, pump_failsafe.off_cycles,
                    pump_failsafe.start_count);
        std::printf("--------------------------------------------------------------\n");
        std::printf(" checks executed         : %u\n", checks);
        std::printf(" checks failed           : %u\n", failures);
        std::printf(" RESULT                  : %s\n", failures == 0 ? "PASS" : "FAIL");
        std::printf("==============================================================\n");
    }
};

}  // namespace smartfarm

#endif  // SMART_FARM_TB_H

