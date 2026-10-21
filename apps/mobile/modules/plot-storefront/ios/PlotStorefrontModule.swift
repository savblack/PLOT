import ExpoModulesCore
import StoreKit

// Reads the App Store storefront country (an ISO 3166-1 alpha-3 code such as
// "USA"). This does not sell anything and uses no purchase API: it only lets
// the app decide whether Apple allows a link to external purchase on this
// storefront (App Review Guidelines 3.1.1(a)). See packages/core/purchaseLinkOut.js.
public class PlotStorefrontModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PlotStorefront")

    AsyncFunction("getCountryCode") { (promise: Promise) in
      Task {
        promise.resolve(await Storefront.current?.countryCode)
      }
    }
  }
}
