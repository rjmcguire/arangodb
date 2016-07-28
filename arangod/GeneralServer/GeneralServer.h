////////////////////////////////////////////////////////////////////////////////
/// DISCLAIMER
///
/// Copyright 2014-2016 ArangoDB GmbH, Cologne, Germany
/// Copyright 2004-2014 triAGENS GmbH, Cologne, Germany
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
/// Copyright holder is ArangoDB GmbH, Cologne, Germany
///
/// @author Dr. Frank Celler
/// @author Achim Brandt
/// @author Jan Steemann
////////////////////////////////////////////////////////////////////////////////

#ifndef ARANGOD_HTTP_SERVER_HTTP_SERVER_H
#define ARANGOD_HTTP_SERVER_HTTP_SERVER_H 1

#include "Scheduler/TaskManager.h"

#include "Basics/Mutex.h"
#include "Endpoint/ConnectionInfo.h"
#include "GeneralServer/GeneralDefinitions.h"
#include "GeneralServer/HttpCommTask.h"
#include "GeneralServer/HttpsCommTask.h"
#include "GeneralServer/RestHandler.h"

namespace arangodb {
class EndpointList;

namespace rest {

class AsyncJobManager;
class Dispatcher;
class GeneralCommTask;
class HttpServerJob;
class Job;
class ListenTask;
class RestHandlerFactory;

class GeneralServer : protected TaskManager {
  GeneralServer(GeneralServer const&) = delete;
  GeneralServer const& operator=(GeneralServer const&) = delete;

 public:
  // destroys an endpoint server
  static int sendChunk(uint64_t, std::string const&);

 public:
  GeneralServer(bool allowMethodOverride,
                std::vector<std::string> const& accessControlAllowOrigins);
  virtual ~GeneralServer();

 public:
  // returns the protocol
  // virtual char const* protocol() const { return "http"; }

  // check, if we allow a method override
  bool allowMethodOverride() { return _allowMethodOverride; }

 public:
  // list of trusted origin urls for CORS
  std::vector<std::string> const& trustedOrigins() const {
    return _accessControlAllowOrigins;
  }

  // adds the endpoint list
  void setEndpointList(const EndpointList* list);

  // starts listening
  void startListening();

  // stops listining
  void stopListening();

  // creates a job for asynchronous execution
  bool handleRequestAsync(GeneralCommTask*,
                          arangodb::WorkItem::uptr<RestHandler>&,
                          uint64_t* jobId);

  // executes the handler directly or add it to the queue
  bool handleRequest(GeneralCommTask*, arangodb::WorkItem::uptr<RestHandler>&);

 protected:
  // Handler, Job, and Task tuple
  struct handler_task_job_t {
    RestHandler* _handler;
    GeneralCommTask* _task;
    HttpServerJob* _job;
  };

 protected:
  // opens a listen port
  bool openEndpoint(Endpoint* endpoint);

  // handle request directly
  void handleRequestDirectly(RestHandler* handler, GeneralCommTask* task);

  // registers a task
  void registerHandler(RestHandler* handler, GeneralCommTask* task);

 protected:
  // active listen tasks
  std::vector<ListenTask*> _listenTasks;

  // defined ports and addresses
  const EndpointList* _endpointList;

  // allow to override the method
  bool _allowMethodOverride;

  // list of trusted origin urls for CORS
  std::vector<std::string> const _accessControlAllowOrigins;

 private:
};
}
}

#endif
