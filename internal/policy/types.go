package policy

import "time"

// ─── Policy API versions ───────────────────────────────────────────────────

const (
	APIVersion = "aegisx.io/v1"

	KindFirewallPolicy     = "FirewallPolicy"
	KindLoadBalancerPolicy = "LoadBalancerPolicy"
	KindVPNPolicy          = "VPNPolicy"
	KindNATPolicy          = "NATPolicy"
	KindIDSPolicy          = "IDSPolicy"
)

// ─── Top-level manifest ────────────────────────────────────────────────────

// Manifest is a single parsed policy document (one YAML ---block).
type Manifest struct {
	APIVersion string   `yaml:"apiVersion" json:"apiVersion"`
	Kind       string   `yaml:"kind"       json:"kind"`
	Metadata   Metadata `yaml:"metadata"   json:"metadata"`

	// Only one of these will be populated depending on Kind.
	FirewallSpec     *FirewallPolicySpec     `yaml:"spec,omitempty" json:"spec,omitempty"`
	LoadBalancerSpec *LoadBalancerPolicySpec `yaml:"-"              json:"-"`
	VPNSpec          *VPNPolicySpec          `yaml:"-"              json:"-"`
	NATSpec          *NATPolicySpec          `yaml:"-"              json:"-"`
	IDSSpec          *IDSPolicySpec          `yaml:"-"              json:"-"`
}

type Metadata struct {
	Name        string            `yaml:"name"        json:"name"`
	Namespace   string            `yaml:"namespace"   json:"namespace"`
	Labels      map[string]string `yaml:"labels"      json:"labels"`
	Annotations map[string]string `yaml:"annotations" json:"annotations"`
}

// ─── Firewall Policy ───────────────────────────────────────────────────────

type FirewallPolicySpec struct {
	DefaultAction string         `yaml:"defaultAction" json:"defaultAction"` // ALLOW | DROP | REJECT
	Rules         []FirewallRule `yaml:"rules"         json:"rules"`
}

type FirewallRule struct {
	Name     string          `yaml:"name"     json:"name"`
	Priority int             `yaml:"priority" json:"priority"`
	Action   string          `yaml:"action"   json:"action"` // ALLOW | DROP | REJECT | LOG
	Protocol string          `yaml:"protocol" json:"protocol"` // tcp|udp|icmp|any
	Source   TrafficSelector `yaml:"source"   json:"source"`
	Dest     TrafficSelector `yaml:"destination" json:"destination"`
	State    []string        `yaml:"state"    json:"state"` // new|established|related|invalid
	RateLimit *RateLimit     `yaml:"rateLimit,omitempty" json:"rateLimit,omitempty"`
	Log      bool            `yaml:"log"      json:"log"`
	Comment  string          `yaml:"comment"  json:"comment"`
}

type TrafficSelector struct {
	Zones     []string `yaml:"zones"     json:"zones"`
	Addresses []string `yaml:"addresses" json:"addresses"` // CIDR or IPs
	Ports     []int    `yaml:"ports"     json:"ports"`
	PortRanges []PortRange `yaml:"portRanges" json:"portRanges"`
	IPSets    []string `yaml:"ipsets"    json:"ipsets"`
}

type PortRange struct {
	Start int `yaml:"start" json:"start"`
	End   int `yaml:"end"   json:"end"`
}

type RateLimit struct {
	Rate  string `yaml:"rate"  json:"rate"`  // e.g. "100/second"
	Burst int    `yaml:"burst" json:"burst"`
}

// ─── Load Balancer Policy ──────────────────────────────────────────────────

type LoadBalancerPolicySpec struct {
	Frontend LBFrontend  `yaml:"frontend" json:"frontend"`
	Backend  LBBackend   `yaml:"backend"  json:"backend"`
	TLS      *LBTLSConfig `yaml:"tls,omitempty" json:"tls,omitempty"`
}

type LBFrontend struct {
	Bind    string `yaml:"bind"    json:"bind"`
	Mode    string `yaml:"mode"    json:"mode"` // tcp | http
	MaxConn int    `yaml:"maxConn" json:"maxConn"`
}

type LBBackend struct {
	Algorithm string     `yaml:"algorithm" json:"algorithm"` // roundrobin|leastconn|source|random
	Servers   []LBServer `yaml:"servers"   json:"servers"`
	HealthCheck *LBHealthCheck `yaml:"healthCheck,omitempty" json:"healthCheck,omitempty"`
	Timeout   string     `yaml:"timeout"   json:"timeout"`
}

type LBServer struct {
	Name    string `yaml:"name"    json:"name"`
	Address string `yaml:"address" json:"address"` // host:port
	Weight  int    `yaml:"weight"  json:"weight"`
	MaxConn int    `yaml:"maxConn" json:"maxConn"`
	Backup  bool   `yaml:"backup"  json:"backup"`
}

type LBHealthCheck struct {
	Interval string `yaml:"interval" json:"interval"` // e.g. "5s"
	Timeout  string `yaml:"timeout"  json:"timeout"`
	Rise     int    `yaml:"rise"     json:"rise"`
	Fall     int    `yaml:"fall"     json:"fall"`
	Path     string `yaml:"path"     json:"path"` // for HTTP checks
}

type LBTLSConfig struct {
	Cert       string `yaml:"cert"       json:"cert"`
	Key        string `yaml:"key"        json:"key"`
	MinVersion string `yaml:"minVersion" json:"minVersion"` // TLSv1.2 | TLSv1.3
}

// ─── VPN Policy ────────────────────────────────────────────────────────────

type VPNPolicySpec struct {
	Interface  string      `yaml:"interface"  json:"interface"`
	ListenPort int         `yaml:"listenPort" json:"listenPort"`
	Address    string      `yaml:"address"    json:"address"` // tunnel CIDR
	DNS        []string    `yaml:"dns"        json:"dns"`
	Peers      []VPNPeer   `yaml:"peers"      json:"peers"`
}

type VPNPeer struct {
	Name        string   `yaml:"name"        json:"name"`
	PublicKey   string   `yaml:"publicKey"   json:"publicKey"`
	AllowedIPs  []string `yaml:"allowedIPs"  json:"allowedIPs"`
	Endpoint    string   `yaml:"endpoint"    json:"endpoint"` // host:port
	PresharedKey string  `yaml:"presharedKey,omitempty" json:"presharedKey,omitempty"`
	KeepAlive   int      `yaml:"keepAlive"   json:"keepAlive"` // seconds
}

// ─── NAT Policy ────────────────────────────────────────────────────────────

type NATPolicySpec struct {
	Rules []NATRule `yaml:"rules" json:"rules"`
}

type NATRule struct {
	Name      string `yaml:"name"      json:"name"`
	Type      string `yaml:"type"      json:"type"` // SNAT | DNAT | MASQUERADE
	Source    string `yaml:"source"    json:"source"`
	Dest      string `yaml:"destination" json:"destination"`
	ToSource  string `yaml:"toSource"  json:"toSource"`  // for SNAT
	ToDest    string `yaml:"toDest"    json:"toDest"`    // for DNAT
	OutIface  string `yaml:"outInterface" json:"outInterface"`
}

// ─── IDS Policy ────────────────────────────────────────────────────────────

type IDSPolicySpec struct {
	Mode        string      `yaml:"mode"        json:"mode"` // ids | ips
	RuleSets    []string    `yaml:"ruleSets"    json:"ruleSets"` // suricata ruleset names
	CustomRules []IDSRule   `yaml:"customRules" json:"customRules"`
	Thresholds  []IDSThreshold `yaml:"thresholds" json:"thresholds"`
}

type IDSRule struct {
	ID      string `yaml:"id"      json:"id"`
	Message string `yaml:"message" json:"message"`
	Rule    string `yaml:"rule"    json:"rule"` // raw Suricata rule string
	Enabled bool   `yaml:"enabled" json:"enabled"`
}

type IDSThreshold struct {
	GID   int    `yaml:"gid"   json:"gid"`
	SID   int    `yaml:"sid"   json:"sid"`
	Type  string `yaml:"type"  json:"type"` // limit|threshold|both
	Track string `yaml:"track" json:"track"` // by_src|by_dst
	Count int    `yaml:"count" json:"count"`
	Seconds int  `yaml:"seconds" json:"seconds"`
}

// ─── Intermediate Representation ──────────────────────────────────────────

// IR is the compiled, backend-agnostic representation of all policies.
type IR struct {
	ID        string    `json:"id"`
	Version   int64     `json:"version"`
	CreatedAt time.Time `json:"createdAt"`

	FirewallRules    []CompiledFirewallRule    `json:"firewallRules"`
	NATRules         []CompiledNATRule         `json:"natRules"`
	LoadBalancers    []CompiledLoadBalancer    `json:"loadBalancers"`
	VPNConfigs       []CompiledVPNConfig       `json:"vpnConfigs"`
	IDSRules         []CompiledIDSRule         `json:"idsRules"`
}

type CompiledFirewallRule struct {
	Priority    int      `json:"priority"`
	Chain       string   `json:"chain"`    // input|output|forward
	Action      string   `json:"action"`   // accept|drop|reject|log
	Protocol    string   `json:"protocol"`
	SrcAddrs    []string `json:"srcAddrs"`
	DstAddrs    []string `json:"dstAddrs"`
	SrcPorts    []string `json:"srcPorts"` // "80" or "8080-8090"
	DstPorts    []string `json:"dstPorts"`
	States      []string `json:"states"`
	RateLimit   string   `json:"rateLimit"`
	Log         bool     `json:"log"`
	Comment     string   `json:"comment"`
}

type CompiledNATRule struct {
	Type      string `json:"type"`
	SrcAddr   string `json:"srcAddr"`
	DstAddr   string `json:"dstAddr"`
	ToAddr    string `json:"toAddr"`
	OutIface  string `json:"outIface"`
}

type CompiledLoadBalancer struct {
	Name      string     `json:"name"`
	Frontend  LBFrontend `json:"frontend"`
	Backend   LBBackend  `json:"backend"`
	TLS       *LBTLSConfig `json:"tls,omitempty"`
}

type CompiledVPNConfig struct {
	Interface  string    `json:"interface"`
	ListenPort int       `json:"listenPort"`
	Address    string    `json:"address"`
	PrivateKey string    `json:"privateKey"`
	Peers      []VPNPeer `json:"peers"`
}

type CompiledIDSRule struct {
	Raw     string `json:"raw"`
	Enabled bool   `json:"enabled"`
}
