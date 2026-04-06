# frozen_string_literal: true

module SMTPClient
  class Endpoint

    class SMTPSessionNotStartedError < StandardError
    end

    attr_reader :server
    attr_reader :ip_address
    attr_accessor :smtp_client

    def initialize(server, ip_address)
      @server = server
      @ip_address = ip_address
    end

    def description
      "#{@ip_address}:#{@server.port} (#{@server.hostname})"
    end

    def to_s
      description
    end

    def ipv6?
      @ip_address.include?(":")
    end

    def ipv4?
      !ipv6?
    end

    def start_smtp_session(source_ip_address: nil, allow_ssl: true)
      @smtp_client = Net::SMTP.new(@ip_address, @server.port)
      @smtp_client.open_timeout = Postal::Config.smtp_client.open_timeout
      @smtp_client.read_timeout = Postal::Config.smtp_client.read_timeout
      @smtp_client.tls_hostname = @server.hostname

      if source_ip_address
        @source_ip_address = source_ip_address
      end

      if @source_ip_address
        @smtp_client.source_address = ipv6? ? @source_ip_address.ipv6 : @source_ip_address.ipv4
      end

      if allow_ssl
        case @server.ssl_mode
        when SSLModes::AUTO
          @smtp_client.enable_starttls_auto(self.class.ssl_context_without_verify)
        when SSLModes::STARTTLS
          @smtp_client.enable_starttls(self.class.ssl_context_with_verify)
        when SSLModes::TLS
          @smtp_client.enable_tls(self.class.ssl_context_with_verify)
        else
          @smtp_client.disable_starttls
          @smtp_client.disable_tls
        end
      else
        @smtp_client.disable_starttls
        @smtp_client.disable_tls
      end

      helo_hostname = @source_ip_address ? @source_ip_address.hostname : self.class.default_helo_hostname
      if @server.username && @server.password
        @smtp_client.start(helo_hostname, @server.username, @server.password, :login)
      else
        @smtp_client.start(helo_hostname)
      end

      @smtp_client
    end

    def send_message(raw_message, mail_from, rcpt_to, retry_on_connection_error: true)
      raise SMTPSessionNotStartedError if @smtp_client.nil? || (@smtp_client && !@smtp_client.started?)

      @smtp_client.rset_errors
      @smtp_client.send_message(raw_message, mail_from, [rcpt_to])
    rescue Errno::ECONNRESET, Errno::EPIPE, OpenSSL::SSL::SSLError
      if retry_on_connection_error
        finish_smtp_session
        start_smtp_session
        return send_message(raw_message, mail_from, rcpt_to, retry_on_connection_error: false)
      end

      raise
    end

    def reset_smtp_session
      @smtp_client&.rset
    rescue StandardError
      finish_smtp_session
    end

    def finish_smtp_session
      @smtp_client&.finish
    rescue StandardError
      nil
    ensure
      @smtp_client = nil
    end

    class << self

      def default_helo_hostname
        Postal::Config.dns.helo_hostname ||
          Postal::Config.postal.smtp_hostname ||
          "localhost"
      end

      def ssl_context_with_verify
        @ssl_context_with_verify ||= begin
          c = OpenSSL::SSL::SSLContext.new
          c.verify_mode = OpenSSL::SSL::VERIFY_PEER
          c.cert_store = OpenSSL::X509::Store.new
          c.cert_store.set_default_paths
          c
        end
      end

      def ssl_context_without_verify
        @ssl_context_without_verify ||= begin
          c = OpenSSL::SSL::SSLContext.new
          c.verify_mode = OpenSSL::SSL::VERIFY_NONE
          c
        end
      end

    end

  end
end
