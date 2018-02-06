/**
 * Copyright (C) 2014-2016 LinkedIn Corp. (pinot-core@linkedin.com)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package com.linkedin.pinot.common.utils;

import com.linkedin.pinot.common.Utils;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.security.KeyStore;
import java.security.KeyStoreException;
import java.security.NoSuchAlgorithmException;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import javax.net.ssl.KeyManager;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;


public class ClientSSLContextGenerator {
  private static final String SECURITY_ALGORITHM = "TLS";
  private static final String CERTIFICATE_TYPE = "X509";
  private static final String KEYSTORE_TYPE = "PKCS12";
  private static final String KEYMANAGER_FACTORY_ALGORITHM = "SunX509";
  private static final Logger _logger = LoggerFactory.getLogger(ClientSSLContextGenerator.class);

  private String _serverCACertFile;
  private boolean _enableServerVerification;
  private String _keyStoreFile;
  private String _keyStorePassword;
  private boolean _presentClientCerts;

  private ClientSSLContextGenerator() {
  }

  private void setKeyStoreFile(String keyStoreFile) {
    _keyStoreFile = keyStoreFile;
  }

  private void setKeyStorePassword(String keyStorePassword) {
    _keyStorePassword = keyStorePassword;
  }

  private void setEnableServerVerification(boolean enableServerVerification) {
    _enableServerVerification = enableServerVerification;
  }

  private void setServerCACertFile(String serverCACertFile) {
    _serverCACertFile = serverCACertFile;
  }

  private void setPresentClientCerts(boolean presentClientCerts) {
    _presentClientCerts = presentClientCerts;
  }

  public SSLContext generate() {
    SSLContext sslContext = null;
    try {
      TrustManager[] trustManagers = setupTrustManagers();
      KeyManager[] keyManagers = setupKeyManagers();

      sslContext = SSLContext.getInstance(SECURITY_ALGORITHM);
      sslContext.init(keyManagers, trustManagers, null);
    } catch (Exception e) {
      Utils.rethrowException(e);
    }
    return sslContext;
  }

  private TrustManager[] setupTrustManagers()
      throws CertificateException, KeyStoreException, IOException, NoSuchAlgorithmException {
    // This is the cert authority that validates server's cert, so we need to put it in our
    // trustStore.
    final String fileNotConfigured = "Https server CA Certificate file not confugured ";
    if (_enableServerVerification) {
      _logger.info("Initializing trust store from {}", _serverCACertFile);
      FileInputStream is = new FileInputStream(new File(_serverCACertFile));
      KeyStore trustStore = KeyStore.getInstance(KeyStore.getDefaultType());
      trustStore.load(null);
      CertificateFactory certificateFactory = CertificateFactory.getInstance(CERTIFICATE_TYPE);
      int i = 0;
      while (is.available() > 0) {
        X509Certificate cert = (X509Certificate) certificateFactory.generateCertificate(is);
        _logger.info("Read certificate serial number {} by issuer {} ", cert.getSerialNumber().toString(16), cert.getIssuerDN().toString());

        String serverKey = "https-server-" + i;
        trustStore.setCertificateEntry(serverKey, cert);
        i++;
      }

      TrustManagerFactory tmf = TrustManagerFactory.getInstance(CERTIFICATE_TYPE);
      tmf.init(trustStore);
      _logger.info("Successfully initialized trust store");
      return tmf.getTrustManagers();
    }
    // Server verification disabled. Trust all servers
    _logger.warn("{}. All servers will be trusted!", fileNotConfigured);
    TrustManager[] trustAllCerts = new TrustManager[]{new X509TrustManager() {
      @Override
      public void checkClientTrusted(X509Certificate[] x509Certificates, String s) throws CertificateException {
      }

      @Override
      public void checkServerTrusted(X509Certificate[] x509Certificates, String s) throws CertificateException {
      }

      @Override
      public X509Certificate[] getAcceptedIssuers() {
        return new X509Certificate[0];
      }
    }};
    return trustAllCerts;
  }

  private KeyManager[] setupKeyManagers() {
    if (!_presentClientCerts) {
      return null;
    }
    try {
      KeyStore keyStore = KeyStore.getInstance(KEYSTORE_TYPE);
      _logger.info("Setting up keystore with file {}", _keyStoreFile);
      keyStore.load(new FileInputStream(new File(_keyStoreFile)), _keyStorePassword.toCharArray());
      KeyManagerFactory kmf = KeyManagerFactory.getInstance(KEYMANAGER_FACTORY_ALGORITHM);
      kmf.init(keyStore, _keyStorePassword.toCharArray());
      _logger.info("Successfully initialized keystore");
      return kmf.getKeyManagers();
    } catch (Exception e) {
      Utils.rethrowException(e);
    }
    return null;
  }

  public static class Builder {
    String _serverCACertFile;
    String _keyStoreFile;
    String _keyStorePassword;
    boolean _enableServerVerification = false;
    boolean _presentClientCerts = false;

    public Builder() {
    }

    /**
     *
     * @param serverCACertFile is path name of a file containing all the certificates from trusted
     *                         Certifying Authorities. The client will verify the server's certificate
     *                         against the CA bundle specified. If this method is not called, or is called
     *                         with a null argument, then server's certificates will not be verified.
     * @return
     */
    public Builder withServerCACertFile(String serverCACertFile) {
      if (serverCACertFile != null) {
        _serverCACertFile = serverCACertFile;
        _enableServerVerification = true;
      }
      return this;
    }

    /**
     *
     * @param keyStoreFile is the path name of a PCKS12 file containing the client certificates to be presented to the
     *                     server during SSL handshake. If this method is called, then
     * @return
     */
    public Builder withKeystoreFile(String keyStoreFile) {
      if (keyStoreFile != null) {
        _keyStoreFile = keyStoreFile;
        _presentClientCerts = true;
      }
      return this;
    }

    /**
     *
     * @param keyStorePassword is the password to open the keyStoreFile.
     * @return
     */
    public Builder withKeyStorePassword(String keyStorePassword) {
      if (keyStorePassword != null) {
        _keyStorePassword = keyStorePassword;
        _presentClientCerts = true;
      }
      return this;
    }

    public ClientSSLContextGenerator build() {
      if ((_keyStoreFile == null && _keyStorePassword != null) ||
          (_keyStoreFile != null && _keyStorePassword == null)) {
        throw new IllegalArgumentException("One of Keystore file or password must be specified");
      }
      ClientSSLContextGenerator sslContextGenerator = new ClientSSLContextGenerator();
      sslContextGenerator.setEnableServerVerification(_enableServerVerification);
      sslContextGenerator.setKeyStoreFile(_keyStoreFile);
      sslContextGenerator.setKeyStorePassword(_keyStorePassword);
      sslContextGenerator.setPresentClientCerts(_presentClientCerts);
      sslContextGenerator.setServerCACertFile(_serverCACertFile);
      return sslContextGenerator;
    }
  }
}