package ratio_setting

import (
	"fmt"
	"math"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/types"
)

// CoreCode fork: how far a model's ratios sit above the provider's official
// price. ModelRatio already carries it, so billing never reads this map; the
// pricing page divides by it to show the official price and the model's own
// discount. A model that is not listed is priced at its official price.
var officialPriceMarkupMap = types.NewRWMap[string, float64]()

func OfficialPriceMarkup2JSONString() string {
	return officialPriceMarkupMap.MarshalJSONString()
}

// UpdateOfficialPriceMarkupByJSONString replaces the map. Every markup must be a
// finite number above zero; a rejected value leaves the map as it was.
func UpdateOfficialPriceMarkupByJSONString(jsonStr string) error {
	parsed := make(map[string]float64)
	if err := common.Unmarshal([]byte(jsonStr), &parsed); err != nil {
		return err
	}
	for model, markup := range parsed {
		if math.IsNaN(markup) || math.IsInf(markup, 0) || markup <= 0 {
			return fmt.Errorf("official price markup for %s must be above zero", model)
		}
	}
	return types.LoadFromJsonStringWithCallback(officialPriceMarkupMap, jsonStr, InvalidateExposedDataCache)
}

// GetOfficialPriceMarkup returns the model's markup, or 1 and false when none is set.
func GetOfficialPriceMarkup(name string) (float64, bool) {
	markup, ok := officialPriceMarkupMap.Get(name)
	if !ok {
		return 1, false
	}
	return markup, true
}
