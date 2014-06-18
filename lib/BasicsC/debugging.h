////////////////////////////////////////////////////////////////////////////////
/// @brief debugging helpers
///
/// @file
///
/// DISCLAIMER
///
/// Copyright 2004-2013 triAGENS GmbH, Cologne, Germany
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///
/// Copyright holder is triAGENS GmbH, Cologne, Germany
///
/// @author Jan Steemann
/// @author Copyright 2011-2013, triAGENS GmbH, Cologne, Germany
////////////////////////////////////////////////////////////////////////////////

#ifndef TRIAGENS_BASICS_C_DEBUGGING_H
#define TRIAGENS_BASICS_C_DEBUGGING_H 1

#ifndef TRI_WITHIN_COMMON
#error use <BasicsC/common.h>
#endif

#ifdef __cplusplus
extern "C" {
#endif

// -----------------------------------------------------------------------------
// --SECTION--                                                    public defines
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief macro TRI_DEBUG_INTENTIONAL_FAIL_IF
/// this macro can be used in maintainer mode to make the server fail at
/// certain locations in the C code. The points at which a failure is actually
/// triggered can be defined at runtime using TRI_AddFailurePointDebugging().
////////////////////////////////////////////////////////////////////////////////

#ifdef TRI_ENABLE_FAILURE_TESTS

#define TRI_DEBUG_INTENTIONAL_FAIL_IF(what) if (TRI_ShouldFailDebugging(what))

#else

#define TRI_DEBUG_INTENTIONAL_FAIL_IF(what) if (false) 

#endif

// -----------------------------------------------------------------------------
// --SECTION--                                                  public functions
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief cause a segmentation violation
////////////////////////////////////////////////////////////////////////////////

#ifdef TRI_ENABLE_FAILURE_TESTS
void TRI_SegfaultDebugging (char const*);
#else
static inline void TRI_SegfaultDebugging (char const* unused) {
}
#endif

////////////////////////////////////////////////////////////////////////////////
/// @brief check whether we should fail at a failure point
////////////////////////////////////////////////////////////////////////////////

#ifdef TRI_ENABLE_FAILURE_TESTS
bool TRI_ShouldFailDebugging (char const*);
#else
static inline bool TRI_ShouldFailDebugging (char const* unused) {
  return false;
}
#endif

////////////////////////////////////////////////////////////////////////////////
/// @brief add a failure point
////////////////////////////////////////////////////////////////////////////////

#ifdef TRI_ENABLE_FAILURE_TESTS
void TRI_AddFailurePointDebugging (char const*);
#else
static inline void TRI_AddFailurePointDebugging (char const* unused) {
}
#endif

////////////////////////////////////////////////////////////////////////////////
/// @brief remove a failure point
////////////////////////////////////////////////////////////////////////////////

#ifdef TRI_ENABLE_FAILURE_TESTS
void TRI_RemoveFailurePointDebugging (char const*);
#else
static inline void TRI_RemoveFailurePointDebugging (char const* unused) {
}
#endif

////////////////////////////////////////////////////////////////////////////////
/// @brief clear all failure points
////////////////////////////////////////////////////////////////////////////////

#ifdef TRI_ENABLE_FAILURE_TESTS
void TRI_ClearFailurePointsDebugging (void);
#else
static inline void TRI_ClearFailurePointsDebugging (void) {
}
#endif

////////////////////////////////////////////////////////////////////////////////
/// @brief returns whether failure point debugging can be used
////////////////////////////////////////////////////////////////////////////////

static inline bool TRI_CanUseFailurePointsDebugging (void) {
#ifdef TRI_ENABLE_FAILURE_TESTS
  return true;
#else
  return false;
#endif
}

////////////////////////////////////////////////////////////////////////////////
/// @brief initialise the debugging
////////////////////////////////////////////////////////////////////////////////

#ifdef TRI_ENABLE_FAILURE_TESTS
void TRI_InitialiseDebugging (void);
#else
static inline void TRI_InitialiseDebugging (void) {
}
#endif

////////////////////////////////////////////////////////////////////////////////
/// @brief shutdown the debugging
////////////////////////////////////////////////////////////////////////////////

#ifdef TRI_ENABLE_FAILURE_TESTS
void TRI_ShutdownDebugging (void);
#else
static inline void TRI_ShutdownDebugging (void) {
}
#endif


#ifdef __cplusplus
}
#endif

#endif

// Local Variables:
// mode: outline-minor
// outline-regexp: "/// @brief\\|/// {@inheritDoc}\\|/// @addtogroup\\|/// @page\\|// --SECTION--\\|/// @\\}"
// End:
