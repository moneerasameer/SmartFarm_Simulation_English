// ===========================================================================
//  sensor_monitor.h - sensor node model
//
//  Produces one measurement per clock cycle (one reporting interval):
//    * soil moisture    : taken from the scripted scenario step driven by the
//                         testbench (deterministic, no random numbers)
//    * air temperature  : synthetic sine wave (documented, NOT measured)
//    * air humidity     : synthetic, derived from temperature and soil
//
//  This module represents the sensor NODE of the architecture: it only
//  generates measurements. Whether they reach the gateway is decided by the
//  LoRaLink module, not here.
// ===========================================================================
#ifndef SMART_FARM_SENSOR_MONITOR_H
#define SMART_FARM_SENSOR_MONITOR_H

#include <systemc>
#include <cmath>
#include <cstdio>

#include "smart_farm_types.h"

namespace smartfarm {

class SensorMonitor : public sc_core::sc_module {
public:
    // Ports -----------------------------------------------------------------
    sc_core::sc_in<bool>       clk{"clk"};
    sc_core::sc_in<unsigned>   step_index{"step_index"};   // driven by the testbench
    sc_core::sc_out<unsigned>  soil_moisture{"soil_moisture"};
    sc_core::sc_out<bool>      sample_ready{"sample_ready"};  // a payload is present
    sc_core::sc_out<double>    air_temperature{"air_temperature"};
    sc_core::sc_out<double>    air_humidity{"air_humidity"};

    // Statistics ------------------------------------------------------------
    unsigned samples_taken = 0;

    SC_CTOR(SensorMonitor)
        : last_soil(0u) {
        SC_METHOD(measure);
        sensitive << clk.pos();
        dont_initialize();
    }

private:
    unsigned last_soil;

    void measure() {
        const unsigned step = step_index.read() % kScenarioSteps;
        const Step& current = kScenario[step];
        const unsigned index = samples_taken;
        const unsigned soil  = current.soil;

        // Air temperature: deterministic synthetic profile (19..29 degC).
        const double temperature =
            24.0 + 5.0 * std::sin(2.0 * M_PI * static_cast<double>(index) / 40.0);

        // Air humidity: anti-correlated with temperature and soil moisture,
        // clipped to a physical range. Synthetic by construction.
        double humidity = 60.0 - 0.8 * (temperature - 24.0) - 0.15 * soil;
        if (humidity < 20.0) humidity = 20.0;
        if (humidity > 95.0) humidity = 95.0;

        soil_moisture.write(soil);
        sample_ready.write(true);   // handshake: the payload is valid from now on
        air_temperature.write(temperature);
        air_humidity.write(humidity);

        // Print only when the reading changes, to keep the transcript readable.
        if (soil != last_soil || index == 0) {
            std::printf("[%8s] sensor  : soil=%3u %%  T=%5.1f C  RH=%5.1f %%   <- %s\n",
                        sc_core::sc_time_stamp().to_string().c_str(), soil,
                        temperature, humidity, current.label);
            last_soil = soil;
        }

        ++samples_taken;
    }
};

}  // namespace smartfarm

#endif  // SMART_FARM_SENSOR_MONITOR_H
