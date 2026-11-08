// ===========================================================================
//  soil_moisture_processor.h - measurement processing / classification
//
//  Converts a raw soil-moisture percentage into the zone that the controller
//  cares about:
//      kZoneDry   : soil <  DRY_THRESHOLD
//      kZoneBand  : DRY_THRESHOLD <= soil <= WET_THRESHOLD   (hysteresis band)
//      kZoneWet   : soil >  WET_THRESHOLD
//
//  The module only classifies VALID measurements: when packet_ready is low the
//  output zone is frozen at its previous value and 'valid' is driven low, so a
//  corrupt payload can never be misinterpreted as a real reading.
//
//  This is the "data conditioning" stage of the gateway: it keeps the control
//  decision separate from the transport layer.
// ===========================================================================
#ifndef SMART_FARM_SOIL_MOISTURE_PROCESSOR_H
#define SMART_FARM_SOIL_MOISTURE_PROCESSOR_H

#include <systemc>
#include <cstdio>

#include "smart_farm_types.h"

namespace smartfarm {

class SoilMoistureProcessor : public sc_core::sc_module {
public:
    // Ports -----------------------------------------------------------------
    sc_core::sc_in<bool>      clk{"clk"};
    sc_core::sc_in<unsigned>  soil_in{"soil_in"};
    sc_core::sc_in<bool>      packet_ready{"packet_ready"};
    sc_core::sc_out<unsigned> zone{"zone"};        // kZoneDry / kZoneBand / kZoneWet
    sc_core::sc_out<bool>     valid{"valid"};      // classification is meaningful

    // Counters --------------------------------------------------------------
    unsigned valid_samples = 0;
    unsigned invalid_samples = 0;

    SC_CTOR(SoilMoistureProcessor)
        : zone_value(kZoneDry),
          last_reported_zone(99u),
          last_reported_valid(2u) {
        SC_METHOD(classify);
        sensitive << clk.pos();
        dont_initialize();
    }

private:
    unsigned zone_value;
    unsigned last_reported_zone;
    unsigned last_reported_valid;

    static unsigned classify_soil(unsigned soil) {
        if (soil < kDryThreshold)  return kZoneDry;
        if (soil > kWetThreshold)  return kZoneWet;
        return kZoneBand;
    }

    void report(unsigned soil, bool valid_now) {
        if (zone_value == last_reported_zone && valid_now == last_reported_valid) {
            return;                     // only print when something changed
        }
        if (valid_now) {
            std::printf("[%8s] process : soil=%3u %% -> zone %s (valid)\n",
                        sc_core::sc_time_stamp().to_string().c_str(), soil,
                        zone_name(zone_value));
        } else {
            std::printf("[%8s] process : no fresh sample -> zone %s held (invalid)\n",
                        sc_core::sc_time_stamp().to_string().c_str(),
                        zone_name(zone_value));
        }
        last_reported_zone = zone_value;
        last_reported_valid = valid_now;
    }

    void classify() {
        if (!packet_ready.read()) {
            // No fresh measurement: hold the last classification, mark invalid.
            zone.write(zone_value);
            valid.write(false);
            ++invalid_samples;
            report(0u, false);
            return;
        }

        const unsigned soil = soil_in.read();
        zone_value = classify_soil(soil);
        zone.write(zone_value);
        valid.write(true);
        ++valid_samples;
        report(soil, true);
    }
};

}  // namespace smartfarm

#endif  // SMART_FARM_SOIL_MOISTURE_PROCESSOR_H
