// ===========================================================================
//  lora_link.h - communication link model (packet delivery)
//
//  Models the uplink from the sensor node to the gateway at packet level:
//  for every sample one radio packet is transmitted. The module decides
//  whether that packet is DELIVERED or LOST and forwards the payload only when
//  it was delivered.
//
//  The channel condition is driven by the testbench through 'link_ok':
//    link_ok = true  -> the packet is delivered
//    link_ok = false -> the packet is lost (outage / interference / gateway down)
//
//  The model is deterministic (no random loss), so a build always produces the
//  same transcript. Random loss and the full link budget (path loss, SNR,
//  packet error rate) are modelled in MATLAB: matlab/lora_link_simulation.m.
//
//  IMPORTANT: this is a software link model. No radio hardware is involved and
//  no RF measurement is claimed.
// ===========================================================================
#ifndef SMART_FARM_LORA_LINK_H
#define SMART_FARM_LORA_LINK_H

#include <systemc>
#include <cstdio>

#include "smart_farm_types.h"

namespace smartfarm {

class LoRaLink : public sc_core::sc_module {
public:
    // Ports -----------------------------------------------------------------
    sc_core::sc_in<bool>      clk{"clk"};
    sc_core::sc_in<bool>      link_ok{"link_ok"};           // channel state (testbench)
    sc_core::sc_in<bool>      sample_ready{"sample_ready"}; // payload present at the node
    sc_core::sc_in<unsigned>  soil_in{"soil_in"};           // payload from the node
    sc_core::sc_out<unsigned> soil_out{"soil_out"};         // payload to the gateway
    sc_core::sc_out<bool>     packet_ready{"packet_ready"}; // 'valid' flag

    // Statistics ------------------------------------------------------------
    unsigned packets_sent = 0;
    unsigned packets_delivered = 0;
    unsigned packets_lost = 0;
    unsigned consecutive_losses = 0;
    unsigned longest_outage = 0;

    SC_CTOR(LoRaLink)
        : reported_state(2u),      // 2 = nothing reported yet
          cur_soil(0u), cur_ready(false), cur_attempted(false),
          next_soil(0u), next_ready(false), next_attempted(false) {
        SC_METHOD(transmit);
        sensitive << clk.pos();
        dont_initialize();
    }

private:
    unsigned reported_state;            // to avoid printing one line per cycle

    // Published stage (values captured on the previous edge).
    unsigned cur_soil;
    bool     cur_ready;
    bool     cur_attempted;

    // Capture stage (values sampled on this edge).
    unsigned next_soil;
    bool     next_ready;
    bool     next_attempted;

    // Registered stage: on every edge the pair captured on the PREVIOUS edge is
    // published, so the payload and its valid flag are always consistent. A
    // reader in the same delta therefore never sees a fresh flag with a stale
    // payload - this is the one-cycle latency of a real radio/register stage.
    void transmit() {
        // ---- 1. publish what was captured on the previous edge -------------
        soil_out.write(cur_soil);
        packet_ready.write(cur_ready);
        if (cur_attempted) {
            ++packets_sent;
        }
        if (cur_ready) {
            ++packets_delivered;
            consecutive_losses = 0;
        } else if (cur_attempted) {
            ++packets_lost;
            ++consecutive_losses;
            if (consecutive_losses > longest_outage) {
                longest_outage = consecutive_losses;
            }
        }

        // ---- 2. capture the current inputs for the next edge ---------------
        next_attempted = sample_ready.read();      // a packet exists to send
        next_soil      = soil_in.read();
        next_ready     = next_attempted && link_ok.read();

        // ---- 3. report only channel state changes --------------------------
        if (next_attempted) {
            if (next_ready && reported_state != 1u) {
                std::printf("[%8s] link    : UP   - delivered (soil=%3u %%)\n",
                            sc_core::sc_time_stamp().to_string().c_str(), next_soil);
                reported_state = 1u;
            } else if (!next_ready && reported_state != 0u) {
                std::printf("[%8s] link    : DOWN - packet lost (blind for %u cycle(s))\n",
                            sc_core::sc_time_stamp().to_string().c_str(),
                            consecutive_losses + 1u);
                reported_state = 0u;
            }
        }

        // ---- 4. shift the pipeline ------------------------------------------
        cur_soil      = next_soil;
        cur_ready     = next_ready;
        cur_attempted = next_attempted;
    }
};

}  // namespace smartfarm

#endif  // SMART_FARM_LORA_LINK_H
