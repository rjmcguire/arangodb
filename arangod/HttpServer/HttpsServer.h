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
////////////////////////////////////////////////////////////////////////////////

#ifndef ARANGOD_HTTP_SERVER_HTTPS_SERVER_H
#define ARANGOD_HTTP_SERVER_HTTPS_SERVER_H 1

#include "HttpServer/HttpServer.h"

#include <openssl/ssl.h>

namespace arangodb {
namespace rest {

class HttpsServer : public HttpServer {
 public:
  HttpsServer(double keepAliveTimeout, bool allowMethodOverride,
              std::vector<std::string> const& accessControlAllowOrigins,
              SSL_CTX*);
  ~HttpsServer();

 public:
  // sets the verification mode
  void setVerificationMode(int mode);

  // sets the verification callback
  void setVerificationCallback(int (*func)(int, X509_STORE_CTX*));

 public:
  char const* protocol() const override { return "https"; }

  Endpoint::EncryptionType encryptionType() const override {
    return Endpoint::EncryptionType::SSL;
  }

  HttpCommTask* createCommTask(TRI_socket_t, ConnectionInfo&&) override;

 private:
  SSL_CTX* _ctx;
  int _verificationMode;
  int (*_verificationCallback)(int, X509_STORE_CTX*);
};
}
}

#endif
