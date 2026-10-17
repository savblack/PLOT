Pod::Spec.new do |s|
  s.name           = 'PlotStorefront'
  s.version        = '1.0.0'
  s.summary        = 'Reads the App Store storefront country.'
  s.description    = 'Reads the App Store storefront country so the app only offers a purchase link where Apple allows one.'
  s.license        = { :type => 'UNLICENSED' }
  s.author         = 'Plot'
  s.homepage       = 'https://theplot.tv'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/savblack/PLOT.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
