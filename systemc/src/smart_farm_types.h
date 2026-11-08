// ===========================================================================
//  smart_farm_types.h - shared definitions for the Smart Farm SystemC model
//
//  This header contains everything that more than one module needs:
//    * the irrigation thresholds (same values as the VHDL RTL and the MATLAB
//      model: 30 % dry, 40 % wet)
//    * the soil-zone encoding used on the sc_signal wires
//    * the scripted test scenario (stimulus + expected pump state)
//
//  Everything in this file is DETERMINISTIC: the SystemC simulation contains no
//  random numbers, so a given build always produces the same transcript.
// ===========================================================================
#ifndef SMART_FARM_TYPES_H
#define SMART_FARM_TYPES_H

#include <systemc>
#include <cstddef>

namespace smartfarm {

// --- Irrigation thresholds (percent) ---------------------------------------
// Documented project law: ON below the dry threshold, OFF above the wet
// threshold, previous state kept inside the band. Identical to
// vhdl/irrigation_controller.vhd (DRY_THRESHOLD / WET_THRESHOLD).
inline constexpr unsigned kDryThreshold = 30;
inline constexpr unsigned kWetThreshold = 40;

// --- Fail-safe watchdog ----------------------------------------------------
// Number of consecutive missing packets after which the fail-safe controller
// forces the pump OFF. Matches MaxHoldSamples in the MATLAB model.
inline constexpr unsigned kMaxHoldSamples = 3;

// --- Soil zone encoding used on the signal wires --------------------------
inline constexpr unsigned kZoneDry  = 0;
inline constexpr unsigned kZoneBand = 1;
inline constexpr unsigned kZoneWet  = 2;

inline const char* zone_name(unsigned zone) {
    switch (zone) {
        case kZoneDry:  return "dry ";
        case kZoneBand: return "band";
        case kZoneWet:  return "wet ";
        default:        return "??? ";
    }
}

// --- One scripted stimulus step -------------------------------------------
struct Step {
    const char* label;        // human readable scenario name
    unsigned    soil;         // soil moisture sample in percent
    bool        packet_ok;    // true = the LoRa packet is delivered
    bool        expect_hold;      // expected pump state, "hold" controller
    bool        expect_failsafe;  // expected pump state, fail-safe controller
};

// --- The complete test scenario -------------------------------------------
// Covers the five required situations:
//   dry soil, normal (band) soil, wet soil, communication failure,
//   automatic irrigation response - plus the divergence between the
//   hold and the fail-safe policy while telemetry is missing.
inline constexpr Step kScenario[] = {
    // label                                      soil  link   hold  failsafe
    { "1. dry soil (20 %), telemetry OK",          20,  true,  true,  true  },
    { "2. normal soil (35 %) inside the band",     35,  true,  true,  true  },
    { "3. wet soil (45 %)",                        45,  true,  false, false },
    { "4. communication failure while pump is OFF", 20,  false, false, false },
    { "5. telemetry back, dry soil -> irrigation", 25,  true,  true,  true  },
    { "6. communication failure while pump is ON", 25,  false, true,  false },
    { "7. telemetry back, dry soil still dry",     25,  true,  true,  true  },
};

inline constexpr std::size_t kScenarioSteps =
    sizeof(kScenario) / sizeof(kScenario[0]);

// --- Clock / timing --------------------------------------------------------
// One clock cycle represents one sensor reporting interval, exactly like the
// "sample index" of the recorded dataset and the MATLAB model.
inline constexpr double kClockPeriodSeconds = 1.0;

// Pipeline stabilisation time: the datapath has several registered stages
// (sensor -> link -> processor -> controller -> pump actuator), so the
// testbench waits this many cycles before it samples the pump outputs.
inline constexpr unsigned kSettleCycles = 8;

}  // namespace smartfarm

#endif  // SMART_FARM_TYPES_H
