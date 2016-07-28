#!/bin/bash

# This requires the perf utility to be installed and the OS must be linux.
# Compile with CMAKE_BUILD_TYPE=RelWithDebInfo in the subdirectory "build".
# Run this script in the main source directory.
#
# This script sets up performance monitoring events to measure single
# document operations. Run this script with sudo when the ArangoDB
# process is already running. Then do
#   sudo perf record -e "probe_arangod:*" -aR sleep 60
# (to sample for 60 seconds). A file "perf.data" is written to the 
# current directory.
# Dump the events in this file with
#   sudo perf script > perf.history
# This logs the times when individual threads hit the events.
# Use the program perfanalyis.cpp in this directory in the following way:
#   sudo ./perfanalyis < perf.history > perf.statistics
# This will group enter and exit events of functions together, compute
# the time spent and sort by function.
# Remove all events with
#   sudo perf probe -d "probe_arangod:*"
# List events with
#   sudo perf probe -l

ARANGOD_EXECUTABLE=build/bin/arangod
perf probe -x $ARANGOD_EXECUTABLE -d "probe_arangod:*"

echo Adding events, this takes a few seconds...

addEvent() {
  x=$1
  y=$2
  if [ "x$y" == "x" ] ; then
    y=$x
  fi
  echo $x
  perf probe -x $ARANGOD_EXECUTABLE -a $x=$y 2> /dev/null
  perf probe -x $ARANGOD_EXECUTABLE -a ${x}Ret=$y%return 2> /dev/null
}
echo Single document operations...
addEvent insertLocal
addEvent removeLocal
addEvent modifyLocal
addEvent documentLocal

echo Single document operations on coordinator...
addEvent insertCoordinator
addEvent removeCoordinator
addEvent updateCoordinator
addEvent replaceCoordinator
addEvent documentCoordinator

echo work method in HttpServerJob
addEvent workHttpServerJob work@HttpServerJob.cpp

echo work method in RestDocumentHandler
addEvent executeRestReadDocument readDocument@RestDocumentHandler.cpp
addEvent executeRestInsertDocument createDocument@RestDocumentHandler.cpp
addEvent handleRequest handleRequest@HttpServer.cpp
addEvent handleWrite handleWrite@SocketTask.cpp

addEvent tcp_sendmsg
addEvent tcp_recvmsg

echo Done.
