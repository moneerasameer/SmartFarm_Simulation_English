# ===========================================================================
#  Makefile - Smart Farm SystemC simulation
#
#    make                 build ./smart_farm
#    make run             build and run
#    make clean           remove the build directory
#
#  The SystemC installation is detected automatically:
#     1. $SYSTEMC_HOME if set
#     2. $HOME/systemc   (local installation used in this project)
#     3. /usr/local, /opt/homebrew, /opt/local
# ===========================================================================
ifeq ($(origin CXX),default)
  CXX := clang++
endif
CXXSTD     ?= -std=c++17
CXXFLAGS   ?= -O2 -g -Wall -Wextra
INCLUDES   := -Isrc
BUILD_DIR  ?= build
TARGET     := $(BUILD_DIR)/smart_farm

# --- locate SystemC --------------------------------------------------------
ifeq ($(strip $(SYSTEMC_HOME)),)
  ifneq ($(wildcard $(HOME)/systemc/include/systemc.h),)
    SYSTEMC_HOME := $(HOME)/systemc
  else ifneq ($(wildcard /usr/local/include/systemc.h),)
    SYSTEMC_HOME := /usr/local
  else ifneq ($(wildcard /opt/homebrew/include/systemc.h),)
    SYSTEMC_HOME := /opt/homebrew
  else ifneq ($(wildcard /opt/local/include/systemc.h),)
    SYSTEMC_HOME := /opt/local
  endif
endif

ifneq ($(strip $(SYSTEMC_HOME)),)
  # library directory name varies between builds: lib, lib-macosx64, lib-linux64
  SYSTEMC_LIB := $(firstword $(wildcard \
                   $(SYSTEMC_HOME)/lib-macosx64 \
                   $(SYSTEMC_HOME)/lib \
                   $(SYSTEMC_HOME)/lib-linux64))
  SYSTEMC_CXXFLAGS := -I$(SYSTEMC_HOME)/include
  SYSTEMC_LDFLAGS  := -L$(SYSTEMC_LIB) -lsystemc
endif

SRC        := smart_farm_main.cpp
HEADERS    := $(wildcard src/*.h)
LDLIBS     := -lpthread

.PHONY: all run clean info

all: info $(TARGET)

info:
	@echo "SystemC home : $(if $(SYSTEMC_HOME),$(SYSTEMC_HOME),NOT FOUND)"
	@echo "SystemC lib  : $(if $(SYSTEMC_LIB),$(SYSTEMC_LIB),NOT FOUND)"
	@echo "compiler     : $(CXX)"
	@echo "target       : $(TARGET)"

$(TARGET): $(SRC) $(HEADERS)
	@if [ -z "$(SYSTEMC_HOME)" ]; then \
	  echo "ERROR: SystemC not found. Install it and/or set SYSTEMC_HOME."; \
	  echo "       See systemc/README.md (installation section)."; \
	  exit 1; \
	fi
	@mkdir -p $(BUILD_DIR)
	$(CXX) $(CXXSTD) $(CXXFLAGS) $(INCLUDES) $(SYSTEMC_CXXFLAGS) $(SRC) -o $@ \
	    $(SYSTEMC_LDFLAGS) $(LDLIBS)

run: $(TARGET)
	./$(TARGET)

clean:
	rm -rf $(BUILD_DIR)
