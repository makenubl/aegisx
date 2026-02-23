package config

import (
	"fmt"
	"strings"
	"time"

	"github.com/spf13/viper"
)

// Config is the root application configuration.
type Config struct {
	Server   ServerConfig   `mapstructure:"server"`
	Database DatabaseConfig `mapstructure:"database"`
	Auth     AuthConfig     `mapstructure:"auth"`
	Firewall FirewallConfig `mapstructure:"firewall"`
	IDS      IDSConfig      `mapstructure:"ids"`
	LB       LBConfig       `mapstructure:"lb"`
	VPN      VPNConfig      `mapstructure:"vpn"`
	Metrics  MetricsConfig  `mapstructure:"metrics"`
	Log      LogConfig      `mapstructure:"log"`
}

type ServerConfig struct {
	Host         string        `mapstructure:"host"`
	Port         int           `mapstructure:"port"`
	GRPCPort     int           `mapstructure:"grpc_port"`
	ReadTimeout  time.Duration `mapstructure:"read_timeout"`
	WriteTimeout time.Duration `mapstructure:"write_timeout"`
	TLSCert      string        `mapstructure:"tls_cert"`
	TLSKey       string        `mapstructure:"tls_key"`
}

type DatabaseConfig struct {
	DSN             string        `mapstructure:"dsn"`
	MaxOpenConns    int           `mapstructure:"max_open_conns"`
	MaxIdleConns    int           `mapstructure:"max_idle_conns"`
	ConnMaxLifetime time.Duration `mapstructure:"conn_max_lifetime"`
	MigrationsPath  string        `mapstructure:"migrations_path"`
}

type AuthConfig struct {
	JWTSecret     string        `mapstructure:"jwt_secret"`
	JWTExpiry     time.Duration `mapstructure:"jwt_expiry"`
	AdminUser     string        `mapstructure:"admin_user"`
	AdminPassword string        `mapstructure:"admin_password"`
}

type FirewallConfig struct {
	Backend      string `mapstructure:"backend"`  // "nftables" | "iptables"
	TableName    string `mapstructure:"table_name"`
	PolicyDir    string `mapstructure:"policy_dir"`
	RollbackDir  string `mapstructure:"rollback_dir"`
	DryRun       bool   `mapstructure:"dry_run"`
	HotReload    bool   `mapstructure:"hot_reload"`
}

type IDSConfig struct {
	Enabled        bool   `mapstructure:"enabled"`
	Mode           string `mapstructure:"mode"` // "ids" | "ips"
	ConfigPath     string `mapstructure:"config_path"`
	RulesPath      string `mapstructure:"rules_path"`
	SocketPath     string `mapstructure:"socket_path"`
	LogPath        string `mapstructure:"log_path"`
	UpdateInterval string `mapstructure:"update_interval"`
}

type LBConfig struct {
	Backend     string `mapstructure:"backend"` // "haproxy" | "envoy"
	ConfigPath  string `mapstructure:"config_path"`
	StatsSocket string `mapstructure:"stats_socket"`
	StatsUser   string `mapstructure:"stats_user"`
	StatsPass   string `mapstructure:"stats_pass"`
}

type VPNConfig struct {
	Enabled    bool   `mapstructure:"enabled"`
	Interface  string `mapstructure:"interface"`
	ListenPort int    `mapstructure:"listen_port"`
	PrivateKey string `mapstructure:"private_key"`
	Network    string `mapstructure:"network"`
	DNS        string `mapstructure:"dns"`
}

type MetricsConfig struct {
	Enabled    bool   `mapstructure:"enabled"`
	Path       string `mapstructure:"path"`
	Port       int    `mapstructure:"port"`
}

type LogConfig struct {
	Level  string `mapstructure:"level"`  // debug | info | warn | error
	Format string `mapstructure:"format"` // json | text
	Output string `mapstructure:"output"` // stdout | file path
}

// Load reads configuration from file and environment variables.
func Load(cfgFile string) (*Config, error) {
	v := viper.New()

	// Defaults
	v.SetDefault("server.host", "0.0.0.0")
	v.SetDefault("server.port", 8080)
	v.SetDefault("server.grpc_port", 9090)
	v.SetDefault("server.read_timeout", "30s")
	v.SetDefault("server.write_timeout", "30s")
	v.SetDefault("database.max_open_conns", 25)
	v.SetDefault("database.max_idle_conns", 5)
	v.SetDefault("database.conn_max_lifetime", "5m")
	v.SetDefault("database.migrations_path", "/app/internal/store/migrations")
	v.SetDefault("auth.jwt_expiry", "24h")
	v.SetDefault("auth.admin_user", "admin")
	v.SetDefault("firewall.backend", "nftables")
	v.SetDefault("firewall.table_name", "aegisx")
	v.SetDefault("firewall.policy_dir", "/etc/aegisx/policies")
	v.SetDefault("firewall.rollback_dir", "/var/lib/aegisx/rollback")
	v.SetDefault("ids.mode", "ips")
	v.SetDefault("ids.config_path", "/etc/suricata/suricata.yaml")
	v.SetDefault("ids.rules_path", "/etc/suricata/rules")
	v.SetDefault("ids.socket_path", "/var/run/suricata/suricata-command.socket")
	v.SetDefault("lb.backend", "haproxy")
	v.SetDefault("lb.config_path", "/etc/haproxy/haproxy.cfg")
	v.SetDefault("lb.stats_socket", "/var/run/haproxy/admin.sock")
	v.SetDefault("vpn.interface", "wg0")
	v.SetDefault("vpn.listen_port", 51820)
	v.SetDefault("vpn.network", "10.200.0.0/24")
	v.SetDefault("metrics.enabled", true)
	v.SetDefault("metrics.path", "/metrics")
	v.SetDefault("metrics.port", 9100)
	v.SetDefault("log.level", "info")
	v.SetDefault("log.format", "json")
	v.SetDefault("log.output", "stdout")

	if cfgFile != "" {
		v.SetConfigFile(cfgFile)
	} else {
		v.AddConfigPath("/etc/aegisx")
		v.AddConfigPath("$HOME/.aegisx")
		v.AddConfigPath(".")
		v.SetConfigName("aegisx")
		v.SetConfigType("yaml")
	}

	// Environment variable overrides: AEGISX_SERVER_PORT, etc.
	v.SetEnvPrefix("AEGISX")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	if err := v.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, fmt.Errorf("reading config: %w", err)
		}
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("unmarshalling config: %w", err)
	}

	return &cfg, nil
}
