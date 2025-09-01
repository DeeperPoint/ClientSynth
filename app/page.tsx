import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ArrowRight, Database, Sparkles, Download, Users, Shield, Zap } from "lucide-react"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />
        <div className="relative max-w-7xl mx-auto px-6 py-24 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <h1 className="text-4xl lg:text-6xl font-bold text-foreground leading-tight text-balance">
                  Synthetic Data
                  <span className="text-primary block">That Actually Works</span>
                </h1>
                <p className="text-xl text-muted-foreground max-w-lg text-pretty">
                  Generate realistic client profiles with AI-powered text and imagery. No more Lorem Ipsum or
                  placeholder data in your applications.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button asChild size="lg" className="group">
                  <Link href="/auth/sign-up">
                    Start Generating
                    <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <Link href="/auth/login">Sign In</Link>
                </Button>
              </div>

              <div className="flex items-center gap-8 pt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">10K+</div>
                  <div className="text-sm text-muted-foreground">Profiles Generated</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">50+</div>
                  <div className="text-sm text-muted-foreground">Data Fields</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">99.9%</div>
                  <div className="text-sm text-muted-foreground">Accuracy</div>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="bg-card border rounded-xl p-6 shadow-lg">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                      <Database className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-card-foreground">Schema: E-commerce Users</h3>
                      <p className="text-sm text-muted-foreground">1,000 records • 12 fields</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm font-medium">Name</span>
                      <span className="text-sm text-muted-foreground">Sarah Chen</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm font-medium">Email</span>
                      <span className="text-sm text-muted-foreground">sarah.chen@techcorp.com</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm font-medium">Company</span>
                      <span className="text-sm text-muted-foreground">TechCorp Solutions</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-accent/10 rounded-lg border border-accent/20">
                      <span className="text-sm font-medium">Profile Image</span>
                      <div className="w-8 h-8 bg-accent/20 rounded-full flex items-center justify-center">
                        <Sparkles className="h-4 w-4 text-accent" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground">Everything You Need for Synthetic Data</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto text-pretty">
              From schema design to AI generation, we've built the complete toolkit for creating realistic test data.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="p-6 hover:shadow-lg transition-shadow">
              <div className="space-y-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Database className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-card-foreground mb-2">Visual Schema Studio</h3>
                  <p className="text-muted-foreground text-pretty">
                    Design your data structure with our intuitive drag-and-drop interface. Define relationships,
                    constraints, and field types visually.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6 hover:shadow-lg transition-shadow">
              <div className="space-y-4">
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-card-foreground mb-2">AI-Powered Generation</h3>
                  <p className="text-muted-foreground text-pretty">
                    Generate contextually aware data using advanced AI models. Names, emails, and addresses that make
                    sense together.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6 hover:shadow-lg transition-shadow">
              <div className="space-y-4">
                <div className="w-12 h-12 bg-chart-2/10 rounded-lg flex items-center justify-center">
                  <Users className="h-6 w-6 text-chart-2" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-card-foreground mb-2">Realistic Profile Images</h3>
                  <p className="text-muted-foreground text-pretty">
                    Generate diverse, professional profile photos using state-of-the-art image generation models. No
                    stock photos needed.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6 hover:shadow-lg transition-shadow">
              <div className="space-y-4">
                <div className="w-12 h-12 bg-chart-3/10 rounded-lg flex items-center justify-center">
                  <Download className="h-6 w-6 text-chart-3" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-card-foreground mb-2">Multiple Export Formats</h3>
                  <p className="text-muted-foreground text-pretty">
                    Export your data as CSV, JSON, Excel, or SQL. Ready to import into any system or application.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6 hover:shadow-lg transition-shadow">
              <div className="space-y-4">
                <div className="w-12 h-12 bg-chart-4/10 rounded-lg flex items-center justify-center">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-card-foreground mb-2">Privacy Compliant</h3>
                  <p className="text-muted-foreground text-pretty">
                    All generated data is completely synthetic. No real personal information is used or stored.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6 hover:shadow-lg transition-shadow">
              <div className="space-y-4">
                <div className="w-12 h-12 bg-chart-5/10 rounded-lg flex items-center justify-center">
                  <Zap className="h-6 w-6 text-chart-5" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-card-foreground mb-2">Batch Processing</h3>
                  <p className="text-muted-foreground text-pretty">
                    Generate thousands of records efficiently with our optimized job processing system and progress
                    tracking.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground">Perfect for Every Use Case</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto text-pretty">
              Whether you're testing, demoing, or developing, Client Synth provides the realistic data you need.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <Card className="p-6 border-l-4 border-l-primary">
                <h3 className="text-lg font-semibold text-card-foreground mb-2">Application Testing</h3>
                <p className="text-muted-foreground">
                  Test your applications with realistic user data instead of repetitive placeholder content.
                </p>
              </Card>

              <Card className="p-6 border-l-4 border-l-accent">
                <h3 className="text-lg font-semibold text-card-foreground mb-2">Sales Demonstrations</h3>
                <p className="text-muted-foreground">
                  Impress prospects with demos populated with believable customer profiles and data.
                </p>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="p-6 border-l-4 border-l-chart-2">
                <h3 className="text-lg font-semibold text-card-foreground mb-2">Development & Staging</h3>
                <p className="text-muted-foreground">
                  Populate development and staging environments with consistent, realistic datasets.
                </p>
              </Card>

              <Card className="p-6 border-l-4 border-l-chart-3">
                <h3 className="text-lg font-semibold text-card-foreground mb-2">Training & Education</h3>
                <p className="text-muted-foreground">
                  Create training materials and educational content with diverse, representative data.
                </p>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-primary text-primary-foreground">
        <div className="max-w-4xl mx-auto text-center px-6">
          <h2 className="text-3xl lg:text-4xl font-bold mb-6 text-balance">Ready to Generate Better Test Data?</h2>
          <p className="text-xl opacity-90 mb-8 max-w-2xl mx-auto text-pretty">
            Join developers and teams who've upgraded from Lorem Ipsum to realistic, AI-generated synthetic data that
            actually makes sense.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" variant="secondary" className="group">
              <Link href="/auth/sign-up">
                Start Free Trial
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10 bg-transparent"
            >
              <Link href="/auth/login">Sign In</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
