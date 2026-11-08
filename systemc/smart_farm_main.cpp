// ===========================================================================
//  smart_farm_main.cpp - sc_main (simulation entry point)
//
//  Instantiates the self-checking testbench, runs the simulation and returns a
//  meaningful exit code:
//      0 = every check passed
//      1 = at least one check failed
//      2 = the simulation did not complete (watchdog / hang protection)
//
//  Build (see Makefile or README):
//      make            # uses $SYSTEMC_HOME (default: $HOME/systemc)
//      ./smart_farm
//
//  No hardware is involved: this is a pure software simulation of a Smart Farm
//  monitoring and irrigation system.
// ===========================================================================
#include <systemc>
#include <cstdio>

#include "smart_farm_tb.h"

int sc_main(int /*argc*/, char* /*argv*/[]) {
    std::printf("==============================================================\n");
    std::printf(" Smart Farm - SystemC simulation (monitoring + automatic\n");
    std::printf(" irrigation control, software only, no hardware)\n");
    std::printf("==============================================================\n");
    std::printf(" SystemC   : %s\n", sc_core::sc_version());
    std::printf(" thresholds: dry < %u %% , wet > %u %% , watchdog %u packets\n",
                smartfarm::kDryThreshold, smartfarm::kWetThreshold,
                smartfarm::kMaxHoldSamples);
    std::printf(" clock     : %.1f s per cycle (one sensor reporting interval)\n",
                smartfarm::kClockPeriodSeconds);

    smartfarm::SmartFarmTB tb{"tb"};

    // Safety bound: the testbench stops the simulation itself; this limit only
    // protects against a hung run so the process can never block forever.
    sc_core::sc_start(sc_core::sc_time(10000.0, sc_core::SC_SEC));

    if (!tb.finished) {
        std::printf("\nERROR: the simulation did not reach the end of the scenario.\n");
        return 2;
    }

    std::printf("\nsc_main exit code: %d (%s)\n",
                tb.failures == 0 ? 0 : 1, tb.failures == 0 ? "PASS" : "FAIL");
    return tb.failures == 0 ? 0 : 1;
}
